import {
  AuthDomainError,
  DEFAULT_LOGIN_AUDIT_RETENTION_DAYS,
  isEmailAllowed,
  normalizeEmail,
  type LoginAuditEntry,
  type SessionUser,
  type VerifiedIdentity,
} from '@/features/auth/domain/auth.entity'
import type {
  IAuthRepository,
  ILoginAuditRepository,
  ISessionManager,
  ITokenVerifier,
} from '@/features/auth/domain/auth.repository'
import { createSessionPayloadSchema } from '@/features/auth/domain/auth.schemas'

export interface CreateUserSessionInput {
  idToken: unknown
  ip?: string
  userAgent?: string
}

export interface CreateUserSessionDependencies {
  tokenVerifier: ITokenVerifier
  authRepository: IAuthRepository
  loginAuditRepository: ILoginAuditRepository
  sessionManager: ISessionManager
}

export interface CreateUserSessionResult {
  user: SessionUser
  sessionToken: string
}

async function recordAuditBestEffort(
  loginAuditRepository: ILoginAuditRepository,
  entry: LoginAuditEntry
): Promise<void> {
  try {
    await loginAuditRepository.record({
      ...entry,
      retentionDays: entry.retentionDays ?? DEFAULT_LOGIN_AUDIT_RETENTION_DAYS,
    })
  } catch (error) {
    console.error(
      '[createUserSessionUseCase] Failed to write login audit entry:',
      error
    )
  }
}

/**
 * Authenticates an identity token, enforces the server-side email allowlist,
 * synchronizes the user profile, records a login audit event, and issues a session token.
 */
export async function createUserSessionUseCase(
  input: CreateUserSessionInput,
  {
    tokenVerifier,
    authRepository,
    loginAuditRepository,
    sessionManager,
  }: CreateUserSessionDependencies
): Promise<CreateUserSessionResult> {
  const { idToken } = createSessionPayloadSchema.parse({
    idToken: input.idToken,
  })

  let identity: VerifiedIdentity
  try {
    identity = await tokenVerifier.verifyIdToken(idToken)
  } catch (error) {
    const providerCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '') || undefined
        : undefined

    throw new AuthDomainError(
      'INVALID_TOKEN',
      'Unable to verify identity token',
      providerCode
    )
  }

  const email = normalizeEmail(identity.email)
  if (!email) {
    throw new AuthDomainError(
      'MISSING_EMAIL',
      'Verified identity does not have an email address'
    )
  }

  const allowedEmail = await authRepository.findAllowedEmail(email)
  if (!isEmailAllowed(allowedEmail)) {
    await recordAuditBestEffort(loginAuditRepository, {
      uid: identity.uid,
      email,
      result: 'DENIED',
      ip: input.ip,
      userAgent: input.userAgent,
    })

    throw new AuthDomainError(
      'UNAUTHORIZED_EMAIL',
      'Email is not authorized to access this application'
    )
  }

  await authRepository.upsertUserProfile({
    uid: identity.uid,
    email,
    displayName: identity.name ?? null,
    photoURL: identity.picture ?? null,
  })

  await recordAuditBestEffort(loginAuditRepository, {
    uid: identity.uid,
    email,
    result: 'SUCCESS',
    ip: input.ip,
    userAgent: input.userAgent,
  })

  const user: SessionUser = {
    uid: identity.uid,
    email,
    name: identity.name ?? '',
    avatar: identity.picture ?? '',
  }

  const sessionToken = await sessionManager.createSessionToken(user)

  return {
    user,
    sessionToken,
  }
}
