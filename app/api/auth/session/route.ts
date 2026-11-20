import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { createUserSessionUseCase } from '@/features/auth/application/create-user-session.use-case'
import { AuthDomainError } from '@/features/auth/domain/auth.entity'
import {
  buildSessionCookieConfig,
  cookieSessionManager,
} from '@/features/auth/infrastructure/cookie-session.manager'
import { firebaseTokenVerifier } from '@/features/auth/infrastructure/firebase-token-verifier'
import { firestoreAuthRepository } from '@/features/auth/infrastructure/firestore-auth.repository'
import { firestoreLoginAuditRepository } from '@/features/auth/infrastructure/firestore-login-audit.repository'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const userAgent = request.headers.get('user-agent') ?? undefined
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined

  if (typeof body?.idToken !== 'string' || !body.idToken.trim()) {
    return NextResponse.json(
      { error: 'Token de sesión requerido.' },
      { status: 400 }
    )
  }

  if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error(
      '[/api/auth/session] Missing FIREBASE_CLIENT_EMAIL and/or FIREBASE_PRIVATE_KEY in environment'
    )
    return NextResponse.json(
      { error: 'Configuración del servidor incompleta.' },
      { status: 500 }
    )
  }

  try {
    const { sessionToken } = await createUserSessionUseCase(
      {
        idToken: body.idToken,
        ip,
        userAgent,
      },
      {
        tokenVerifier: firebaseTokenVerifier,
        authRepository: firestoreAuthRepository,
        loginAuditRepository: firestoreLoginAuditRepository,
        sessionManager: cookieSessionManager,
      }
    )

    const response = NextResponse.json({ ok: true })
    response.cookies.set(buildSessionCookieConfig(sessionToken))

    return response
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? 'Token de sesión requerido.' },
        { status: 400 }
      )
    }

    if (error instanceof AuthDomainError) {
      if (error.code === 'MISSING_EMAIL') {
        return NextResponse.json(
          { error: 'La cuenta no tiene un correo asociado.' },
          { status: 400 }
        )
      }

      if (error.code === 'UNAUTHORIZED_EMAIL') {
        return NextResponse.json(
          { error: 'Tu correo no está autorizado.' },
          { status: 403 }
        )
      }

      console.error('[/api/auth/session] Failed to verify session token:', {
        code: error.providerCode,
      })
      return NextResponse.json(
        { error: 'No se pudo validar la sesión.', code: error.providerCode },
        { status: 401 }
      )
    }

    console.error('[/api/auth/session] Unexpected authentication error:', error)
    return NextResponse.json(
      { error: 'No se pudo iniciar sesión.' },
      { status: 500 }
    )
  }
}
