import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findAllowedEmail: vi.fn(),
  upsertUserProfile: vi.fn(),
  recordAudit: vi.fn(),
}))

vi.mock('@/features/auth/infrastructure/firebase-token-verifier', () => ({
  firebaseTokenVerifier: {
    verifyIdToken: mocks.verifyIdToken,
  },
}))

vi.mock('@/features/auth/infrastructure/firestore-auth.repository', () => ({
  firestoreAuthRepository: {
    findAllowedEmail: mocks.findAllowedEmail,
    upsertUserProfile: mocks.upsertUserProfile,
  },
}))

vi.mock(
  '@/features/auth/infrastructure/firestore-login-audit.repository',
  () => ({
    firestoreLoginAuditRepository: {
      record: mocks.recordAudit,
    },
  })
)

import { POST } from '@/app/api/auth/session/route'
import { SESSION_COOKIE_NAME } from '@/lib/session'

const ORIGINAL_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL
const ORIGINAL_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/session', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com'
    process.env.FIREBASE_PRIVATE_KEY = 'test-private-key'
    mocks.upsertUserProfile.mockResolvedValue(undefined)
    mocks.recordAudit.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (ORIGINAL_CLIENT_EMAIL === undefined) {
      delete process.env.FIREBASE_CLIENT_EMAIL
    } else {
      process.env.FIREBASE_CLIENT_EMAIL = ORIGINAL_CLIENT_EMAIL
    }

    if (ORIGINAL_PRIVATE_KEY === undefined) {
      delete process.env.FIREBASE_PRIVATE_KEY
    } else {
      process.env.FIREBASE_PRIVATE_KEY = ORIGINAL_PRIVATE_KEY
    }
  })

  it('returns 400 when the token is missing', async () => {
    const response = await POST(request({}))

    expect(response.status).toBe(400)
    expect(mocks.verifyIdToken).not.toHaveBeenCalled()
  })

  it('returns 500 when admin credentials are missing', async () => {
    delete process.env.FIREBASE_CLIENT_EMAIL
    delete process.env.FIREBASE_PRIVATE_KEY

    const response = await POST(request({ idToken: 'token' }))

    expect(response.status).toBe(500)
  })

  it('returns 401 when the token is invalid', async () => {
    mocks.verifyIdToken.mockRejectedValue({ code: 'auth/id-token-expired' })

    const response = await POST(request({ idToken: 'token' }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.code).toBe('auth/id-token-expired')
    expect(mocks.verifyIdToken).toHaveBeenCalledWith('token')
  })

  it('returns 400 when the account has no email', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'u1' })

    const response = await POST(request({ idToken: 'token' }))

    expect(response.status).toBe(400)
  })

  it('returns 403 and logs a DENIED attempt when the email is not allowed', async () => {
    mocks.verifyIdToken.mockResolvedValue({
      uid: 'u1',
      email: ' NoAuth@Example.com ',
    })
    mocks.findAllowedEmail.mockResolvedValue(null)

    const response = await POST(
      request(
        { idToken: 'token' },
        {
          'x-forwarded-for': '203.0.113.5, 10.0.0.1',
          'user-agent': 'test-agent',
        }
      )
    )

    expect(response.status).toBe(403)
    expect(mocks.upsertUserProfile).not.toHaveBeenCalled()
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      uid: 'u1',
      email: 'noauth@example.com',
      result: 'DENIED',
      ip: '203.0.113.5',
      userAgent: 'test-agent',
      retentionDays: 90,
    })
  })

  it('returns 403 and logs a DENIED attempt when the allowlist entry is inactive', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'a@b.com' })
    mocks.findAllowedEmail.mockResolvedValue({
      email: 'a@b.com',
      active: false,
    })

    const response = await POST(request({ idToken: 'token' }))

    expect(response.status).toBe(403)
    expect(mocks.upsertUserProfile).not.toHaveBeenCalled()
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      uid: 'u1',
      email: 'a@b.com',
      result: 'DENIED',
      ip: undefined,
      userAgent: undefined,
      retentionDays: 90,
    })
  })

  it('returns 200, syncs profile, sets the session cookie, and logs SUCCESS', async () => {
    mocks.verifyIdToken.mockResolvedValue({
      uid: 'u1',
      email: 'a@b.com',
      name: 'Ana',
      picture: 'https://example.com/a.png',
    })
    mocks.findAllowedEmail.mockResolvedValue({
      email: 'a@b.com',
      active: true,
    })

    const response = await POST(
      request(
        { idToken: 'token' },
        {
          'x-forwarded-for': '203.0.113.5',
          'user-agent': 'test-agent',
        }
      )
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBeTruthy()
    expect(mocks.upsertUserProfile).toHaveBeenCalledWith({
      uid: 'u1',
      email: 'a@b.com',
      displayName: 'Ana',
      photoURL: 'https://example.com/a.png',
    })
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      uid: 'u1',
      email: 'a@b.com',
      result: 'SUCCESS',
      ip: '203.0.113.5',
      userAgent: 'test-agent',
      retentionDays: 90,
    })
  })

  it('does not fail the login when the audit log write fails', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'a@b.com' })
    mocks.findAllowedEmail.mockResolvedValue({
      email: 'a@b.com',
      active: true,
    })
    mocks.recordAudit.mockRejectedValue(new Error('firestore down'))

    const response = await POST(request({ idToken: 'token' }))

    expect(response.status).toBe(200)
  })
})
