import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  collection: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => ({
    collection: (name: string) => {
      mocks.collection(name)
      return { add: mocks.add }
    },
  }),
}))

import { FirestoreLoginAuditRepository } from '@/features/auth/infrastructure/firestore-login-audit.repository'

const DAY_MS = 24 * 60 * 60 * 1000

describe('FirestoreLoginAuditRepository', () => {
  const repository = new FirestoreLoginAuditRepository()

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('writes an audit entry to the loginLogs collection with 90-day TTL', async () => {
    const before = Date.now()

    await repository.record({
      uid: 'u1',
      email: 'a@b.com',
      result: 'SUCCESS',
      ip: '203.0.113.5',
      userAgent: 'test-agent',
    })

    const after = Date.now()

    expect(mocks.collection).toHaveBeenCalledWith('loginLogs')
    expect(mocks.add).toHaveBeenCalledTimes(1)

    const document = mocks.add.mock.calls[0][0]

    expect(document).toMatchObject({
      uid: 'u1',
      email: 'a@b.com',
      result: 'SUCCESS',
      ip: '203.0.113.5',
      userAgent: 'test-agent',
    })
    expect(document.createdAt).toBeDefined()

    const expireAt = document.expireAt.toMillis()

    expect(expireAt).toBeGreaterThanOrEqual(before + 90 * DAY_MS)
    expect(expireAt).toBeLessThanOrEqual(after + 90 * DAY_MS)
  })

  it('stores null when ip and user agent are absent', async () => {
    await repository.record({ uid: 'u1', email: 'a@b.com', result: 'DENIED' })

    const document = mocks.add.mock.calls[0][0]

    expect(document.ip).toBeNull()
    expect(document.userAgent).toBeNull()
  })
})
