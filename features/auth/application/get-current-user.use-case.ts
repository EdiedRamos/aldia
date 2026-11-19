import type { SessionUser } from '@/features/auth/domain/auth.entity'
import type { ISessionManager } from '@/features/auth/domain/auth.repository'

export interface GetCurrentUserDependencies {
  sessionManager: ISessionManager
}

/**
 * Retrieves the currently authenticated user from the active session, or null if unauthenticated.
 */
export async function getCurrentUserUseCase({
  sessionManager,
}: GetCurrentUserDependencies): Promise<SessionUser | null> {
  return sessionManager.getCurrentSessionUser()
}
