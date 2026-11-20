import { describe, expect, it } from 'vitest'

import {
  assertContactChannelInvariant,
  buildWhatsAppUrl,
  ContactDomainError,
  formatPhoneDisplay,
  getContactInitials,
  normalizePhoneToE164,
  tryNormalizePhoneToE164,
} from '@/features/contacts/domain/contact.entity'
import {
  buildContactPhotoPath,
  ContactPhotoPolicyError,
  isAllowedContactPhotoMimeType,
  isOwnedContactPhotoPath,
  MAX_CONTACT_PHOTO_SIZE_BYTES,
  resolveContactPhotoExtension,
  validateContactPhotoFile,
} from '@/features/contacts/domain/contact.policy'
import {
  createContactSchema,
  updateContactSchema,
} from '@/features/contacts/domain/contact.schemas'

describe('features/contacts/domain/contact.entity - phone normalization & helpers', () => {
  it('normalizes 10-digit Colombian mobile numbers assuming +57 prefix', () => {
    expect(normalizePhoneToE164('3001234567')).toBe('+573001234567')
    expect(normalizePhoneToE164('310 555 1234')).toBe('+573105551234')
    expect(normalizePhoneToE164('(320) 444-5566')).toBe('+573204445566')
    expect(normalizePhoneToE164('315.987.6543')).toBe('+573159876543')
  })

  it('normalizes numbers with explicit international prefix or 57 Colombian prefix', () => {
    expect(normalizePhoneToE164('+57 300 123 4567')).toBe('+573001234567')
    expect(normalizePhoneToE164('573001234567')).toBe('+573001234567')
    expect(normalizePhoneToE164('00573001234567')).toBe('+573001234567')
    expect(normalizePhoneToE164('+1 (415) 555-2671')).toBe('+14155552671')
    expect(normalizePhoneToE164('+34 612 345 678')).toBe('+34612345678')
  })

  it('returns null for empty, null, or undefined phone values', () => {
    expect(normalizePhoneToE164(null)).toBeNull()
    expect(normalizePhoneToE164(undefined)).toBeNull()
    expect(normalizePhoneToE164('')).toBeNull()
    expect(normalizePhoneToE164('   ')).toBeNull()
  })

  it('rejects invalid phone formats', () => {
    expect(tryNormalizePhoneToE164('12345')).toBeNull()
    expect(tryNormalizePhoneToE164('2001234567')).toBeNull()
    expect(tryNormalizePhoneToE164('+0123456789')).toBeNull()
    expect(tryNormalizePhoneToE164('not-a-phone')).toBeNull()
    expect(tryNormalizePhoneToE164('+571234567890123456')).toBeNull()

    expect(() => normalizePhoneToE164('12345')).toThrow(ContactDomainError)
    try {
      normalizePhoneToE164('abc')
    } catch (error) {
      expect(error).toBeInstanceOf(ContactDomainError)
      expect((error as ContactDomainError).code).toBe('INVALID_PHONE')
    }
  })

  it('formats Colombian E.164 numbers, builds WhatsApp URLs, and extracts initials', () => {
    expect(formatPhoneDisplay('+573001234567')).toBe('+57 300 123 4567')
    expect(formatPhoneDisplay('+14155552671')).toBe('+14155552671')
    expect(buildWhatsAppUrl('+573001234567')).toBe('https://wa.me/573001234567')
    expect(getContactInitials('María Fernanda López')).toBe('ML')
    expect(getContactInitials('Carlos')).toBe('CA')
    expect(getContactInitials('   ')).toBe('?')
  })

  it('enforces channel and self-guarantor invariants', () => {
    expect(() =>
      assertContactChannelInvariant('+573001234567', null, 'c1')
    ).not.toThrow()
    expect(() => assertContactChannelInvariant(null, 'c2', 'c1')).not.toThrow()
    expect(() =>
      assertContactChannelInvariant('+573001234567', 'c2', 'c1')
    ).not.toThrow()

    expect(() => assertContactChannelInvariant(null, null, 'c1')).toThrow(
      ContactDomainError
    )
    expect(() =>
      assertContactChannelInvariant('+573001234567', 'c1', 'c1')
    ).toThrow(ContactDomainError)
  })
})

describe('features/contacts/domain/contact.schemas', () => {
  it('validates a contact with direct phone and normalizes to E.164', () => {
    const parsed = createContactSchema.parse({
      name: '  Carlos Gómez  ',
      phone: '300 123 4567',
      guarantorContactId: '',
      notes: '  Amigo de confianza  ',
    })

    expect(parsed).toEqual({
      name: 'Carlos Gómez',
      phone: '+573001234567',
      guarantorContactId: null,
      notes: 'Amigo de confianza',
    })
  })

  it('validates a third-party contact with guarantorContactId and no direct phone', () => {
    const parsed = createContactSchema.parse({
      name: 'Pedro Referido',
      phone: '',
      guarantorContactId: 'contact-guarantor-1',
    })

    expect(parsed).toEqual({
      name: 'Pedro Referido',
      phone: null,
      guarantorContactId: 'contact-guarantor-1',
      notes: null,
    })
  })

  it('rejects creating a contact with neither phone nor guarantorContactId', () => {
    const result = createContactSchema.safeParse({
      name: 'Sin Canal',
      phone: '',
      guarantorContactId: '',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/teléfono propio/i)
    }
  })

  it('rejects invalid phone and rejects clearing both phone and guarantor in updateContactSchema', () => {
    expect(
      createContactSchema.safeParse({
        name: 'Juan',
        phone: '12345',
      }).success
    ).toBe(false)

    expect(
      updateContactSchema.safeParse({
        phone: null,
        guarantorContactId: null,
      }).success
    ).toBe(false)

    const partialUpdate = updateContactSchema.parse({
      phone: '311-222-3344',
      guarantorContactId: null,
    })
    expect(partialUpdate).toEqual({
      phone: '+573112223344',
      guarantorContactId: null,
    })
  })
})

describe('features/contacts/domain/contact.policy', () => {
  it('allows only image/* MIME types and rejects PDFs and non-images', () => {
    expect(isAllowedContactPhotoMimeType('image/jpeg')).toBe(true)
    expect(isAllowedContactPhotoMimeType('image/png')).toBe(true)
    expect(isAllowedContactPhotoMimeType('image/webp')).toBe(true)
    expect(isAllowedContactPhotoMimeType('application/pdf')).toBe(false)
    expect(isAllowedContactPhotoMimeType('text/plain')).toBe(false)
    expect(isAllowedContactPhotoMimeType('')).toBe(false)
  })

  it('sanitizes extensions and builds private avatar storage paths safely', () => {
    expect(resolveContactPhotoExtension('image/jpeg', 'pic.PNG')).toBe('jpg')
    expect(resolveContactPhotoExtension('image/webp', 'pic.webp')).toBe('webp')
    expect(
      resolveContactPhotoExtension('image/custom', 'bad..file', '.AVIF!')
    ).toBe('avif')

    expect(buildContactPhotoPath('user-1', 'contact-1', '.JPG')).toBe(
      'contacts/user-1/contact-1/avatar.jpg'
    )
    expect(() => buildContactPhotoPath('../other', 'contact-1', 'jpg')).toThrow(
      ContactPhotoPolicyError
    )

    expect(
      isOwnedContactPhotoPath('user-1', 'contacts/user-1/contact-1/avatar.jpg')
    ).toBe(true)
    expect(
      isOwnedContactPhotoPath('user-1', 'contacts/user-2/contact-1/avatar.jpg')
    ).toBe(false)
    expect(
      isOwnedContactPhotoPath(
        'user-1',
        'contacts/user-1/../user-2/contact-1/avatar.jpg'
      )
    ).toBe(false)
  })

  it('enforces max 2 MB size limit and image MIME type in validateContactPhotoFile', () => {
    expect(
      validateContactPhotoFile({
        sizeBytes: MAX_CONTACT_PHOTO_SIZE_BYTES,
        contentType: 'image/png',
        fileName: 'avatar.png',
      })
    ).toEqual({
      contentType: 'image/png',
      extension: 'png',
    })

    expect(() =>
      validateContactPhotoFile({
        sizeBytes: 0,
        contentType: 'image/jpeg',
      })
    ).toThrow(ContactPhotoPolicyError)

    expect(() =>
      validateContactPhotoFile({
        sizeBytes: MAX_CONTACT_PHOTO_SIZE_BYTES + 1,
        contentType: 'image/jpeg',
      })
    ).toThrow(/exceeds maximum size/i)

    expect(() =>
      validateContactPhotoFile({
        sizeBytes: 1024,
        contentType: 'application/pdf',
      })
    ).toThrow(/unsupported contact photo mime type/i)
  })
})
