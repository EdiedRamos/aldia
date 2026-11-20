export const MAX_CONTACT_PHOTO_SIZE_BYTES = 2 * 1024 * 1024

export const ALLOWED_CONTACT_PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const CONTACT_PHOTO_SIGNED_URL_TTL_SECONDS = 3600

export type ContactPhotoPolicyErrorCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MIME_TYPE'
  | 'INVALID_PATH_SEGMENT'

export class ContactPhotoPolicyError extends Error {
  readonly code: ContactPhotoPolicyErrorCode
  readonly userMessage: string

  constructor(
    code: ContactPhotoPolicyErrorCode,
    message: string,
    userMessage: string
  ) {
    super(message)
    this.name = 'ContactPhotoPolicyError'
    this.code = code
    this.userMessage = userMessage
  }
}

export interface ContactPhotoValidationInput {
  sizeBytes: number
  contentType: string
  fileName?: string
  extension?: string
}

export interface ValidatedContactPhotoFile {
  contentType: string
  extension: string
}

/**
 * Checks whether a MIME type is allowed for contact profile photos
 * (`image/jpeg`, `image/png`, or `image/webp` only).
 */
export function isAllowedContactPhotoMimeType(contentType: string): boolean {
  const normalized = contentType.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return ALLOWED_CONTACT_PHOTO_MIME_TYPES.includes(
    normalized as (typeof ALLOWED_CONTACT_PHOTO_MIME_TYPES)[number]
  )
}

/**
 * Sanitizes a raw file extension keeping only lowercase alphanumeric characters.
 */
export function sanitizePhotoExtension(rawExtension: string): string | null {
  const cleaned = rawExtension
    .trim()
    .replace(/^\.+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  return cleaned ? cleaned : null
}

/**
 * Resolves a safe extension for a contact avatar image based on its MIME type,
 * optional explicit extension, or original file name.
 */
export function resolveContactPhotoExtension(
  contentType: string,
  fileName?: string,
  explicitExtension?: string
): string {
  const normalizedMime = contentType.trim().toLowerCase()

  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') {
    return 'jpg'
  }
  if (normalizedMime === 'image/png') {
    return 'png'
  }
  if (normalizedMime === 'image/webp') {
    return 'webp'
  }
  if (normalizedMime === 'image/heic') {
    return 'heic'
  }
  if (normalizedMime === 'image/gif') {
    return 'gif'
  }
  if (normalizedMime === 'image/avif') {
    return 'avif'
  }

  if (explicitExtension) {
    const sanitized = sanitizePhotoExtension(explicitExtension)
    if (sanitized) {
      return sanitized
    }
  }

  if (fileName) {
    const parts = fileName.split('.')
    if (parts.length > 1) {
      const sanitized = sanitizePhotoExtension(parts[parts.length - 1] ?? '')
      if (sanitized) {
        return sanitized
      }
    }
  }

  return 'jpg'
}

/**
 * Builds the canonical private storage path for a contact avatar:
 * `contacts/${userId}/${contactId}/avatar.${ext}`.
 */
export function buildContactPhotoPath(
  userId: string,
  contactId: string,
  extension: string
): string {
  const safeUserId = userId.trim()
  const safeContactId = contactId.trim()

  if (
    !safeUserId ||
    !safeContactId ||
    safeUserId.includes('/') ||
    safeUserId.includes('\\') ||
    safeUserId.includes('..') ||
    safeContactId.includes('/') ||
    safeContactId.includes('\\') ||
    safeContactId.includes('..')
  ) {
    throw new ContactPhotoPolicyError(
      'INVALID_PATH_SEGMENT',
      'Invalid userId or contactId for contact photo path',
      'No se pudo construir la ruta de la foto de perfil.'
    )
  }

  const sanitizedExt = sanitizePhotoExtension(extension) ?? 'jpg'
  return `contacts/${safeUserId}/${safeContactId}/avatar.${sanitizedExt}`
}

/**
 * Verifies that a contact photo storage path strictly belongs to the given `userId`
 * and does not attempt path traversal.
 */
export function isOwnedContactPhotoPath(
  userId: string,
  photoPath: string
): boolean {
  const normalized = photoPath.trim()
  if (
    !normalized ||
    normalized.includes('..') ||
    normalized.includes('\\') ||
    !userId
  ) {
    return false
  }

  return normalized.startsWith(`contacts/${userId}/`)
}

/**
 * Enforces contact profile photo business rules (non-empty, max 2 MB, `image/*` only)
 * and returns normalized metadata ready for private storage upload.
 */
export function validateContactPhotoFile(
  input: ContactPhotoValidationInput
): ValidatedContactPhotoFile {
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new ContactPhotoPolicyError(
      'EMPTY_FILE',
      'Contact photo buffer cannot be empty',
      'La foto de perfil está vacía.'
    )
  }

  if (input.sizeBytes > MAX_CONTACT_PHOTO_SIZE_BYTES) {
    throw new ContactPhotoPolicyError(
      'FILE_TOO_LARGE',
      `Contact photo exceeds maximum size of ${MAX_CONTACT_PHOTO_SIZE_BYTES} bytes`,
      'La foto de perfil no puede superar los 2 MB.'
    )
  }

  const normalizedMime = input.contentType.trim().toLowerCase()
  if (!isAllowedContactPhotoMimeType(normalizedMime)) {
    throw new ContactPhotoPolicyError(
      'UNSUPPORTED_MIME_TYPE',
      `Unsupported contact photo MIME type: ${input.contentType}`,
      'Solo se permiten imágenes en formato JPG, PNG o WebP para la foto de perfil.'
    )
  }

  return {
    contentType: normalizedMime,
    extension: resolveContactPhotoExtension(
      normalizedMime,
      input.fileName,
      input.extension
    ),
  }
}
