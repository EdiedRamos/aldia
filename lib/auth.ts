import 'server-only'

import { getCurrentUserUseCase } from '@/features/auth/application/get-current-user.use-case'
import type { SessionUser } from '@/features/auth/domain/auth.entity'
import { cookieSessionManager } from '@/features/auth/infrastructure/cookie-session.manager'

export type CurrentUser = SessionUser

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return getCurrentUserUseCase({
    sessionManager: cookieSessionManager,
  })
}
