import { NextResponse } from "next/server"

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin"
import { recordLoginLog, type LoginLogInput } from "@/lib/login-log"
import {
  encryptSession,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/session"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const idToken = body?.idToken
  const userAgent = request.headers.get("user-agent") ?? undefined
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined

  async function logLogin(input: LoginLogInput) {
    try {
      await recordLoginLog({ ...input, ip, userAgent })
    } catch (error) {
      console.error(
        "[/api/auth/session] No se pudo registrar el inicio de sesión:",
        error
      )
    }
  }

  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json(
      { error: "Token de sesión requerido." },
      { status: 400 }
    )
  }

  if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error(
      "[/api/auth/session] Faltan FIREBASE_CLIENT_EMAIL y/o FIREBASE_PRIVATE_KEY en .env.local"
    )
    return NextResponse.json(
      { error: "Configuración del servidor incompleta." },
      { status: 500 }
    )
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true)
    console.log({ decoded })
    const email = decoded.email?.trim().toLowerCase()

    if (!email) {
      return NextResponse.json(
        { error: "La cuenta no tiene un correo asociado." },
        { status: 400 }
      )
    }

    const allowed = await getAdminDb().doc(`allowedEmails/${email}`).get()

    if (!allowed.exists) {
      await logLogin({
        uid: decoded.uid,
        email,
        result: "denied",
      })

      return NextResponse.json(
        { error: "Tu correo no está autorizado." },
        { status: 403 }
      )
    }

    await logLogin({
      uid: decoded.uid,
      email,
      result: "ok",
    })

    const session = await encryptSession({ uid: decoded.uid, email, picture: decoded.picture, name: decoded.name })
    const response = NextResponse.json({ ok: true })

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: session,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    })

    return response
  } catch (error) {
    console.error("[/api/auth/session] Error al validar la sesión:", error)
    const code = (error as { code?: string })?.code

    return NextResponse.json(
      { error: "No se pudo validar la sesión.", code },
      { status: 401 }
    )
  }
}
