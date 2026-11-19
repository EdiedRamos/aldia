export type UserRole = 'ADMIN'

export type WhatsappConnectionStatus = 'DISCONNECTED' | 'CONNECTED'

export type LoginAuditResult = 'SUCCESS' | 'DENIED'

export interface AllowedEmail {
  email: string
  active: boolean
}

export interface UserWhatsappConfig {
  status: WhatsappConnectionStatus
  phone: string | null
  connectedAt: string | null
}

export interface UserPreferences {
  currency: 'COP'
  reminderDaysBefore: number
}

export interface UserProfile {
  uid: string
  email: string
  displayName: string | null
  photoURL: string | null
  role: UserRole
  createdAt: string
  updatedAt: string
  whatsappConfig: UserWhatsappConfig
  preferences: UserPreferences
}

export interface SessionUser {
  uid: string
  name: string
  email: string
  avatar: string
}

export interface VerifiedIdentity {
  uid: string
  email?: string
  name?: string
  picture?: string
}

export interface LoginAuditEntry {
  uid: string
  email: string
  result: LoginAuditResult
  ip?: string
  userAgent?: string
  retentionDays?: number
}

export const DEFAULT_LOGIN_AUDIT_RETENTION_DAYS = 90

export const DEFAULT_USER_PROFILE_POLICY: {
  role: UserRole
  whatsappConfig: UserWhatsappConfig
  preferences: UserPreferences
} = {
  role: 'ADMIN',
  whatsappConfig: {
    status: 'DISCONNECTED',
    phone: null,
    connectedAt: null,
  },
  preferences: {
    currency: 'COP',
    reminderDaysBefore: 3,
  },
}

export type AuthDomainErrorCode =
  'INVALID_TOKEN' | 'MISSING_EMAIL' | 'UNAUTHORIZED_EMAIL'

export class AuthDomainError extends Error {
  readonly code: AuthDomainErrorCode
  readonly providerCode?: string

  constructor(
    code: AuthDomainErrorCode,
    message: string,
    providerCode?: string
  ) {
    super(message)
    this.name = 'AuthDomainError'
    this.code = code
    this.providerCode = providerCode
  }
}

/**
 * Normalizes an email address to trimmed lowercase form, returning null if empty.
 */
export function normalizeEmail(
  email: string | null | undefined
): string | null {
  const normalized = email?.trim().toLowerCase()
  return normalized ? normalized : null
}

/**
 * Evaluates the allowlist invariant: the document must exist and have `active === true`.
 */
export function isEmailAllowed(entry: AllowedEmail | null): boolean {
  return entry !== null && entry.active === true
}

/**
 * Builds the default initial user profile using domain-level policies.
 */
export function buildInitialUserProfile(
  identity: {
    uid: string
    email: string
    displayName: string | null
    photoURL: string | null
  },
  nowIso: string = new Date().toISOString()
): UserProfile {
  return {
    uid: identity.uid,
    email: identity.email,
    displayName: identity.displayName,
    photoURL: identity.photoURL,
    role: DEFAULT_USER_PROFILE_POLICY.role,
    createdAt: nowIso,
    updatedAt: nowIso,
    whatsappConfig: { ...DEFAULT_USER_PROFILE_POLICY.whatsappConfig },
    preferences: { ...DEFAULT_USER_PROFILE_POLICY.preferences },
  }
}
