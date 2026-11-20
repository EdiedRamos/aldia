import type { ISessionManager } from '@/features/auth/domain/auth.repository'

export interface RevokeSessionDependencies {
  sessionManager: ISessionManager
}

/**
 * Revokes the current user session.
 */
export async function revokeSessionUseCase({
  sessionManager,
}: RevokeSessionDependencies): Promise<void> {
  await sessionManager.clearSession()
}
