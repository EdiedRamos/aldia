import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({
    path: `${collection}/${id}`,
  })),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}))

vi.mock('@/lib/firebase', () => ({
  auth: { name: 'auth' },
  db: { name: 'db' },
}))

vi.mock('firebase/auth', () => ({
  signOut: mocks.signOut,
}))

vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
  serverTimestamp: mocks.serverTimestamp,
}))

import type { User } from 'firebase/auth'

import { syncUserWithFirestore } from '@/lib/user-sync'

function googleUser(overrides: Partial<User> = {}) {
  return {
    uid: 'uid-1',
    email: ' Admin@Example.com ',
    displayName: 'Admin',
    photoURL: 'https://example.com/photo.png',
    ...overrides,
  } as User
}

function allowedDoc(active = true) {
  return {
    exists: () => true,
    data: () => ({ email: 'admin@example.com', active }),
  }
}

const missingDoc = {
  exists: () => false,
  data: () => undefined,
}

const existingUserDoc = {
  exists: () => true,
  data: () => ({ uid: 'uid-1' }),
}

describe('syncUserWithFirestore', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.doc.mockImplementation((_db, collection, id) => ({
      path: `${collection}/${id}`,
    }))
    mocks.serverTimestamp.mockReturnValue('SERVER_TIMESTAMP')
    mocks.setDoc.mockResolvedValue(undefined)
    mocks.signOut.mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('signs out and rejects when the Google account has no email', async () => {
    const result = await syncUserWithFirestore(googleUser({ email: null }))

    expect(result).toEqual({ success: false, reason: 'UNAUTHORIZED_EMAIL' })
    expect(mocks.signOut).toHaveBeenCalledWith({ name: 'auth' })
    expect(mocks.getDoc).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('signs out and rejects when the email is not in the allowlist', async () => {
    mocks.getDoc.mockResolvedValueOnce(missingDoc)

    const result = await syncUserWithFirestore(googleUser())

    expect(result).toEqual({ success: false, reason: 'UNAUTHORIZED_EMAIL' })
    expect(mocks.signOut).toHaveBeenCalledWith({ name: 'auth' })
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('signs out and rejects when the allowlist entry is inactive', async () => {
    mocks.getDoc.mockResolvedValueOnce(allowedDoc(false))

    const result = await syncUserWithFirestore(googleUser())

    expect(result).toEqual({ success: false, reason: 'UNAUTHORIZED_EMAIL' })
    expect(mocks.signOut).toHaveBeenCalledWith({ name: 'auth' })
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('creates the full default profile on first login', async () => {
    mocks.getDoc
      .mockResolvedValueOnce(allowedDoc())
      .mockResolvedValueOnce(missingDoc)

    const result = await syncUserWithFirestore(googleUser())

    expect(result).toEqual({ success: true })
    expect(mocks.doc).toHaveBeenCalledWith(
      { name: 'db' },
      'allowedEmails',
      'admin@example.com'
    )
    expect(mocks.doc).toHaveBeenCalledWith({ name: 'db' }, 'users', 'uid-1')
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { path: 'users/uid-1' },
      {
        uid: 'uid-1',
        email: 'admin@example.com',
        displayName: 'Admin',
        photoURL: 'https://example.com/photo.png',
        updatedAt: 'SERVER_TIMESTAMP',
        role: 'ADMIN',
        createdAt: 'SERVER_TIMESTAMP',
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
    )
  })

  it('merges only the Google fields for an existing user', async () => {
    mocks.getDoc
      .mockResolvedValueOnce(allowedDoc())
      .mockResolvedValueOnce(existingUserDoc)

    const result = await syncUserWithFirestore(googleUser())

    expect(result).toEqual({ success: true })
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { path: 'users/uid-1' },
      {
        email: 'admin@example.com',
        displayName: 'Admin',
        photoURL: 'https://example.com/photo.png',
        updatedAt: 'SERVER_TIMESTAMP',
      },
      { merge: true }
    )

    const payload = mocks.setDoc.mock.calls[0][1]
    expect(payload).not.toHaveProperty('createdAt')
    expect(payload).not.toHaveProperty('whatsappConfig')
    expect(payload).not.toHaveProperty('preferences')
    expect(payload).not.toHaveProperty('role')
  })

  it('returns SYNC_FAILED without signing out when the profile write fails', async () => {
    mocks.getDoc
      .mockResolvedValueOnce(allowedDoc())
      .mockResolvedValueOnce(missingDoc)
    mocks.setDoc.mockRejectedValue(new Error('permission-denied'))

    const result = await syncUserWithFirestore(googleUser())

    expect(result).toEqual({ success: false, reason: 'SYNC_FAILED' })
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('returns SYNC_FAILED when the allowlist read fails', async () => {
    mocks.getDoc.mockRejectedValue(new Error('unavailable'))

    const result = await syncUserWithFirestore(googleUser())

    expect(result).toEqual({ success: false, reason: 'SYNC_FAILED' })
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})
