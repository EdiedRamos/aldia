import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  docGet: vi.fn(),
  userGet: vi.fn(),
  userSet: vi.fn(),
  docPath: vi.fn(),
  collectionDoc: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => ({
    doc: (path: string) => {
      mocks.docPath(path)
      return { get: mocks.docGet }
    },
    collection: (name: string) => ({
      doc: (id: string) => {
        mocks.collectionDoc(`${name}/${id}`)
        return {
          get: mocks.userGet,
          set: mocks.userSet,
        }
      },
    }),
  }),
}))

import { FirestoreAuthRepository } from '@/features/auth/infrastructure/firestore-auth.repository'

describe('FirestoreAuthRepository', () => {
  const repository = new FirestoreAuthRepository()

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.userSet.mockResolvedValue(undefined)
  })

  it('returns null when email is not present in allowedEmails', async () => {
    mocks.docGet.mockResolvedValue({ exists: false })

    const entry = await repository.findAllowedEmail('missing@example.com')

    expect(mocks.docPath).toHaveBeenCalledWith(
      'allowedEmails/missing@example.com'
    )
    expect(entry).toBeNull()
  })

  it('returns active flag from allowedEmails document', async () => {
    mocks.docGet.mockResolvedValue({
      exists: true,
      data: () => ({ email: 'admin@example.com', active: true }),
    })

    const entry = await repository.findAllowedEmail('admin@example.com')

    expect(entry).toEqual({ email: 'admin@example.com', active: true })
  })

  it('creates the full default profile on first login', async () => {
    mocks.userGet.mockResolvedValue({ exists: false })

    await repository.upsertUserProfile({
      uid: 'uid-1',
      email: 'admin@example.com',
      displayName: 'Admin',
      photoURL: 'https://example.com/photo.png',
    })

    expect(mocks.collectionDoc).toHaveBeenCalledWith('users/uid-1')
    expect(mocks.userSet).toHaveBeenCalledTimes(1)

    const payload = mocks.userSet.mock.calls[0][0]
    expect(payload).toMatchObject({
      uid: 'uid-1',
      email: 'admin@example.com',
      displayName: 'Admin',
      photoURL: 'https://example.com/photo.png',
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
    })
    expect(payload.createdAt).toBeDefined()
    expect(payload.updatedAt).toBeDefined()
  })

  it('merges only identity fields for an existing user without overwriting defaults', async () => {
    mocks.userGet.mockResolvedValue({ exists: true })

    await repository.upsertUserProfile({
      uid: 'uid-1',
      email: 'admin@example.com',
      displayName: 'Admin',
      photoURL: 'https://example.com/photo.png',
    })

    expect(mocks.userSet).toHaveBeenCalledTimes(1)
    const [payload, options] = mocks.userSet.mock.calls[0]
    expect(payload).toMatchObject({
      email: 'admin@example.com',
      displayName: 'Admin',
      photoURL: 'https://example.com/photo.png',
    })
    expect(payload.updatedAt).toBeDefined()
    expect(payload).not.toHaveProperty('createdAt')
    expect(payload).not.toHaveProperty('whatsappConfig')
    expect(payload).not.toHaveProperty('preferences')
    expect(payload).not.toHaveProperty('role')
    expect(options).toEqual({ merge: true })
  })
})
