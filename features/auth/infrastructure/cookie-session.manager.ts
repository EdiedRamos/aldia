import 'server-only'
import { cookies } from 'next/headers'

import type { SessionUser } from '@/features/auth/domain/auth.entity'
import type { ISessionManager } from '@/features/auth/domain/auth.repository'
import {
  decryptSession,
  encryptSession,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from '@/lib/session'

export function buildSessionCookieConfig(token: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  }
}

export class CookieSessionManager implements ISessionManager {
  async createSessionToken(user: SessionUser): Promise<string> {
    return encryptSession({
      uid: user.uid,
      email: user.email,
      name: user.name,
      picture: user.avatar || undefined,
    })
  }

  async getCurrentSessionUser(): Promise<SessionUser | null> {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    const session = await decryptSession(token)

    if (!session) {
      return null
    }

    return {
      uid: session.uid,
      name: session.name,
      email: session.email,
      avatar: session.picture ?? '',
    }
  }

  async clearSession(): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.delete(SESSION_COOKIE_NAME)
  }
}

export const cookieSessionManager = new CookieSessionManager()
