export type ContactStatus = 'ACTIVE' | 'ARCHIVED'

export interface Contact {
  id: string
  userId: string
  name: string
  phone: string | null
  guarantorContactId: string | null
  photoPath: string | null
  notes: string | null
  status: ContactStatus
  createdAt: Date | string
  updatedAt: Date | string
}

export type ContactDomainErrorCode =
  | 'INVALID_PHONE'
  | 'MISSING_CONTACT_CHANNEL'
  | 'DUPLICATE_PHONE'
  | 'SELF_GUARANTOR'
  | 'GUARANTOR_NOT_FOUND'
  | 'GUARANTOR_WITHOUT_PHONE'
  | 'CONTACT_NOT_FOUND'
  | 'CONTACT_IS_ACTIVE_GUARANTOR'
  | 'CANNOT_REMOVE_PHONE_WHILE_GUARANTOR'

export class ContactDomainError extends Error {
  readonly code: ContactDomainErrorCode
  readonly userMessage: string

  constructor(
    code: ContactDomainErrorCode,
    message: string,
    userMessage: string
  ) {
    super(message)
    this.name = 'ContactDomainError'
    this.code = code
    this.userMessage = userMessage
  }
}

export const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/
const COLOMBIAN_MOBILE_LOCAL_REGEX = /^3\d{9}$/
const COLOMBIAN_MOBILE_WITH_COUNTRY_CODE_REGEX = /^573\d{9}$/

/**
 * Pure helper that attempts to normalize a raw phone string to E.164 format.
 * Assumes Colombia's `+57` prefix when given a 10-digit Colombian mobile number (3XXXXXXXXX)
 * without country code. Returns `null` if the input cannot be normalized to valid E.164.
 */
export function tryNormalizePhoneToE164(rawPhone: string): string | null {
  const trimmed = rawPhone.trim()
  if (!trimmed) {
    return null
  }

  let cleaned = trimmed.replace(/[\s\-().]/g, '')
  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`
  }

  if (cleaned.startsWith('+')) {
    return E164_PHONE_REGEX.test(cleaned) ? cleaned : null
  }

  if (!/^\d+$/.test(cleaned)) {
    return null
  }

  if (COLOMBIAN_MOBILE_LOCAL_REGEX.test(cleaned)) {
    return `+57${cleaned}`
  }

  if (COLOMBIAN_MOBILE_WITH_COUNTRY_CODE_REGEX.test(cleaned)) {
    return `+${cleaned}`
  }

  return null
}

/**
 * Normalizes an optional phone number to E.164 format.
 * Empty/null/undefined inputs return `null`; non-empty invalid inputs throw `ContactDomainError`.
 */
export function normalizePhoneToE164(
  rawPhone: string | null | undefined
): string | null {
  if (rawPhone === null || rawPhone === undefined || rawPhone.trim() === '') {
    return null
  }

  const normalized = tryNormalizePhoneToE164(rawPhone)
  if (!normalized) {
    throw new ContactDomainError(
      'INVALID_PHONE',
      `Invalid phone number format: ${rawPhone}`,
      'Ingresa un número de teléfono válido (ej. 300 123 4567 o +57 300 123 4567).'
    )
  }

  return normalized
}

/**
 * Formats an E.164 phone number for readable UI presentation.
 */
export function formatPhoneDisplay(e164Phone: string): string {
  const colombianMatch = /^\+57(3\d{2})(\d{3})(\d{4})$/.exec(e164Phone)
  if (colombianMatch) {
    return `+57 ${colombianMatch[1]} ${colombianMatch[2]} ${colombianMatch[3]}`
  }

  return e164Phone
}

/**
 * Builds a WhatsApp quick-chat URL (`https://wa.me/...`) from an E.164 phone number.
 */
export function buildWhatsAppUrl(e164Phone: string): string {
  const digits = e164Phone.replace(/\D/g, '')
  return `https://wa.me/${digits}`
}

/**
 * Computes up to 2 uppercase initials from a contact's name for avatar fallback display.
 */
export function getContactInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)

  if (words.length === 0) {
    return '?'
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

/**
 * Enforces core contact channel invariants:
 * 1. A contact cannot be its own guarantor/intermediary.
 * 2. A contact must always have either a direct phone or a guarantorContactId.
 */
export function assertContactChannelInvariant(
  phone: string | null,
  guarantorContactId: string | null,
  contactId?: string
): void {
  if (contactId && guarantorContactId && contactId === guarantorContactId) {
    throw new ContactDomainError(
      'SELF_GUARANTOR',
      `Contact ${contactId} cannot be its own guarantor`,
      'Un contacto no puede ser intermediario de sí mismo.'
    )
  }

  if (!phone && !guarantorContactId) {
    throw new ContactDomainError(
      'MISSING_CONTACT_CHANNEL',
      'Contact must have either a phone number or a guarantorContactId',
      'Debes ingresar un teléfono propio o seleccionar un intermediario/codeudor.'
    )
  }
}
