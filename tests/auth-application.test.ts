import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createUserSessionUseCase } from '@/features/auth/application/create-user-session.use-case'
import { getCurrentUserUseCase } from '@/features/auth/application/get-current-user.use-case'
import { revokeSessionUseCase } from '@/features/auth/application/revoke-session.use-case'
import {
  AuthDomainError,
  DEFAULT_LOGIN_AUDIT_RETENTION_DAYS,
} from '@/features/auth/domain/auth.entity'
import type {
  IAuthRepository,
  ILoginAuditRepository,
  ISessionManager,
  ITokenVerifier,
} from '@/features/auth/domain/auth.repository'

function createDeps(
  overrides: Partial<{
    tokenVerifier: ITokenVerifier
    authRepository: IAuthRepository
    loginAuditRepository: ILoginAuditRepository
    sessionManager: ISessionManager
  }> = {}
) {
  return {
    tokenVerifier: {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: 'u1',
        email: ' Admin@Example.com ',
        name: 'Admin User',
        picture: 'https://example.com/photo.png',
      }),
    },
    authRepository: {
      findAllowedEmail: vi
        .fn()
        .mockResolvedValue({ email: 'admin@example.com', active: true }),
      upsertUserProfile: vi.fn().mockResolvedValue(undefined),
    },
    loginAuditRepository: {
      record: vi.fn().mockResolvedValue(undefined),
    },
    sessionManager: {
      createSessionToken: vi.fn().mockResolvedValue('signed-jwt-token'),
      getCurrentSessionUser: vi.fn().mockResolvedValue({
        uid: 'u1',
        name: 'Admin User',
        email: 'admin@example.com',
        avatar: 'https://example.com/photo.png',
      }),
      clearSession: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  }
}

describe('features/auth/application use cases', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('createUserSessionUseCase validates allowlist, syncs profile, records SUCCESS audit, and issues session token', async () => {
    const deps = createDeps()

    const result = await createUserSessionUseCase(
      {
        idToken: 'valid-token',
        ip: '203.0.113.5',
        userAgent: 'test-agent',
      },
      deps
    )

    expect(deps.tokenVerifier.verifyIdToken).toHaveBeenCalledWith('valid-token')
    expect(deps.authRepository.findAllowedEmail).toHaveBeenCalledWith(
      'admin@example.com'
    )
    expect(deps.authRepository.upsertUserProfile).toHaveBeenCalledWith({
      uid: 'u1',
      email: 'admin@example.com',
      displayName: 'Admin User',
      photoURL: 'https://example.com/photo.png',
    })
    expect(deps.loginAuditRepository.record).toHaveBeenCalledWith({
      uid: 'u1',
      email: 'admin@example.com',
      result: 'SUCCESS',
      ip: '203.0.113.5',
      userAgent: 'test-agent',
      retentionDays: DEFAULT_LOGIN_AUDIT_RETENTION_DAYS,
    })
    expect(result).toEqual({
      user: {
        uid: 'u1',
        email: 'admin@example.com',
        name: 'Admin User',
        avatar: 'https://example.com/photo.png',
      },
      sessionToken: 'signed-jwt-token',
    })
  })

  it('createUserSessionUseCase throws UNAUTHORIZED_EMAIL and records DENIED audit without syncing profile when email is not allowed', async () => {
    const deps = createDeps({
      authRepository: {
        findAllowedEmail: vi.fn().mockResolvedValue(null),
        upsertUserProfile: vi.fn(),
      },
    })

    await expect(
      createUserSessionUseCase(
        { idToken: 'valid-token', ip: '203.0.113.5', userAgent: 'agent' },
        deps
      )
    ).rejects.toMatchObject({
      name: 'AuthDomainError',
      code: 'UNAUTHORIZED_EMAIL',
    })

    expect(deps.authRepository.upsertUserProfile).not.toHaveBeenCalled()
    expect(deps.loginAuditRepository.record).toHaveBeenCalledWith({
      uid: 'u1',
      email: 'admin@example.com',
      result: 'DENIED',
      ip: '203.0.113.5',
      userAgent: 'agent',
      retentionDays: DEFAULT_LOGIN_AUDIT_RETENTION_DAYS,
    })
    expect(deps.sessionManager.createSessionToken).not.toHaveBeenCalled()
  })

  it('createUserSessionUseCase throws INVALID_TOKEN preserving provider error code', async () => {
    const deps = createDeps({
      tokenVerifier: {
        verifyIdToken: vi
          .fn()
          .mockRejectedValue({ code: 'auth/id-token-expired' }),
      },
    })

    await expect(
      createUserSessionUseCase({ idToken: 'expired-token' }, deps)
    ).rejects.toEqual(
      new AuthDomainError(
        'INVALID_TOKEN',
        'Unable to verify identity token',
        'auth/id-token-expired'
      )
    )
  })

  it('createUserSessionUseCase throws MISSING_EMAIL when verified identity lacks an email', async () => {
    const deps = createDeps({
      tokenVerifier: {
        verifyIdToken: vi.fn().mockResolvedValue({ uid: 'u1' }),
      },
    })

    await expect(
      createUserSessionUseCase({ idToken: 'token' }, deps)
    ).rejects.toMatchObject({
      code: 'MISSING_EMAIL',
    })
  })

  it('createUserSessionUseCase succeeds even if audit logging fails', async () => {
    const deps = createDeps({
      loginAuditRepository: {
        record: vi.fn().mockRejectedValue(new Error('firestore down')),
      },
    })

    const result = await createUserSessionUseCase({ idToken: 'token' }, deps)
    expect(result.sessionToken).toBe('signed-jwt-token')
  })

  it('getCurrentUserUseCase and revokeSessionUseCase delegate to sessionManager', async () => {
    const deps = createDeps()

    const currentUser = await getCurrentUserUseCase({
      sessionManager: deps.sessionManager,
    })
    expect(currentUser?.uid).toBe('u1')

    await revokeSessionUseCase({ sessionManager: deps.sessionManager })
    expect(deps.sessionManager.clearSession).toHaveBeenCalledTimes(1)
  })
})
