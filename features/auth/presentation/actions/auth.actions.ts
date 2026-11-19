'use server'

import { redirect } from 'next/navigation'

import { revokeSessionUseCase } from '@/features/auth/application/revoke-session.use-case'
import { cookieSessionManager } from '@/features/auth/infrastructure/cookie-session.manager'

/**
 * Unified server action to terminate the authenticated user session and redirect to `/login`.
 */
export async function logoutAction(): Promise<void> {
  await revokeSessionUseCase({
    sessionManager: cookieSessionManager,
  })
  redirect('/login')
}
