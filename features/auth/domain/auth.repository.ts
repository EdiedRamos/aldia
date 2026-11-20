import type {
  AllowedEmail,
  LoginAuditEntry,
  SessionUser,
  VerifiedIdentity,
} from '@/features/auth/domain/auth.entity'

export interface UpsertUserProfileInput {
  uid: string
  email: string
  displayName: string | null
  photoURL: string | null
}

export interface IAuthRepository {
  findAllowedEmail(email: string): Promise<AllowedEmail | null>
  upsertUserProfile(input: UpsertUserProfileInput): Promise<void>
}

export interface ILoginAuditRepository {
  record(entry: LoginAuditEntry): Promise<void>
}

export interface ITokenVerifier {
  verifyIdToken(idToken: string): Promise<VerifiedIdentity>
}

export interface ISessionManager {
  createSessionToken(user: SessionUser): Promise<string>
  getCurrentSessionUser(): Promise<SessionUser | null>
  clearSession(): Promise<void>
}
