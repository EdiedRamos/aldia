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

import { recordLoginLog } from '@/lib/login-log'

const DAY_MS = 24 * 60 * 60 * 1000

describe('recordLoginLog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('writes a log entry to the loginLogs collection', async () => {
    const before = Date.now()

    await recordLoginLog({
      uid: 'u1',
      email: 'a@b.com',
      result: 'ok',
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
      result: 'ok',
      ip: '203.0.113.5',
      userAgent: 'test-agent',
    })
    expect(document.createdAt).toBeDefined()

    const expireAt = document.expireAt.toMillis()

    expect(expireAt).toBeGreaterThanOrEqual(before + 90 * DAY_MS)
    expect(expireAt).toBeLessThanOrEqual(after + 90 * DAY_MS)
  })

  it('stores null when ip and user agent are absent', async () => {
    await recordLoginLog({ uid: 'u1', email: 'a@b.com', result: 'denied' })

    const document = mocks.add.mock.calls[0][0]

    expect(document.ip).toBeNull()
    expect(document.userAgent).toBeNull()
  })
})
