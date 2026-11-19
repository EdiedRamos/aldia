import { describe, expect, it } from 'vitest'

import {
  buildInitialUserProfile,
  DEFAULT_USER_PROFILE_POLICY,
  isEmailAllowed,
  normalizeEmail,
} from '@/features/auth/domain/auth.entity'
import { createSessionPayloadSchema } from '@/features/auth/domain/auth.schemas'

describe('features/auth/domain/auth.entity', () => {
  it('normalizes email strings by trimming and lowercasing', () => {
    expect(normalizeEmail('  Admin@Example.COM ')).toBe('admin@example.com')
    expect(normalizeEmail('   ')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })

  it('evaluates allowlist rule strictly requiring active === true', () => {
    expect(isEmailAllowed(null)).toBe(false)
    expect(isEmailAllowed({ email: 'a@b.com', active: false })).toBe(false)
    expect(isEmailAllowed({ email: 'a@b.com', active: true })).toBe(true)
  })

  it('builds initial user profile using domain-level defaults', () => {
    const profile = buildInitialUserProfile(
      {
        uid: 'u1',
        email: 'admin@example.com',
        displayName: 'Admin',
        photoURL: 'https://example.com/avatar.png',
      },
      '2026-11-19T00:00:00.000Z'
    )

    expect(profile).toEqual({
      uid: 'u1',
      email: 'admin@example.com',
      displayName: 'Admin',
      photoURL: 'https://example.com/avatar.png',
      role: DEFAULT_USER_PROFILE_POLICY.role,
      createdAt: '2026-11-19T00:00:00.000Z',
      updatedAt: '2026-11-19T00:00:00.000Z',
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
  })
})

describe('features/auth/domain/auth.schemas', () => {
  it('validates createSessionPayloadSchema', () => {
    expect(createSessionPayloadSchema.parse({ idToken: ' tok-123 ' })).toEqual({
      idToken: 'tok-123',
    })
    expect(() => createSessionPayloadSchema.parse({ idToken: '   ' })).toThrow()
    expect(() => createSessionPayloadSchema.parse({})).toThrow()
  })
})
