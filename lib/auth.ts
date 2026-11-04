import 'server-only'

import { cookies } from 'next/headers'

import { decryptSession, SESSION_COOKIE_NAME } from '@/lib/session'

export type CurrentUser = {
  name: string
  email: string
  avatar: string
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const session = await decryptSession(token)

  if (!session) {
    return null
  }

  return {
    name: session.name,
    email: session.email,
    avatar: session.picture ?? '',
  }
}
