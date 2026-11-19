import type { ReceiptType } from '@/features/services/domain/service.entity'

export const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024

export const ALLOWED_RECEIPT_MIME_TYPES = ['application/pdf'] as const
export const ALLOWED_RECEIPT_MIME_PREFIXES = ['image/'] as const

export type ReceiptPolicyErrorCode =
  'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_MIME_TYPE'

export class ReceiptPolicyError extends Error {
  readonly code: ReceiptPolicyErrorCode
  readonly userMessage: string

  constructor(
    code: ReceiptPolicyErrorCode,
    message: string,
    userMessage: string
  ) {
    super(message)
    this.name = 'ReceiptPolicyError'
    this.code = code
    this.userMessage = userMessage
  }
}

export interface ReceiptFileValidationInput {
  sizeBytes: number
  contentType: string
  fileName?: string
  extension?: string
}

export interface ValidatedReceiptFile {
  contentType: string
  extension: string
  receiptType: ReceiptType
}

/**
 * Checks whether a MIME type is allowed for service payment receipts (`image/*` or `application/pdf`).
 */
export function isAllowedReceiptMimeType(contentType: string): boolean {
  const normalized = contentType.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  if (
    ALLOWED_RECEIPT_MIME_TYPES.includes(
      normalized as (typeof ALLOWED_RECEIPT_MIME_TYPES)[number]
    )
  ) {
    return true
  }

  return ALLOWED_RECEIPT_MIME_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix)
  )
}

/**
 * Maps an allowed MIME type to the domain ReceiptType.
 */
export function resolveReceiptTypeFromMime(contentType: string): ReceiptType {
  return contentType.trim().toLowerCase() === 'application/pdf'
    ? 'PDF'
    : 'IMAGE'
}

function sanitizeExtension(rawExtension: string): string | null {
  const cleaned = rawExtension
    .trim()
    .replace(/^\.+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  return cleaned ? cleaned : null
}

/**
 * Normalizes and resolves the file extension for a receipt based on its MIME type,
 * optional explicit extension, or file name.
 */
export function resolveReceiptExtension(
  contentType: string,
  fileName?: string,
  explicitExtension?: string
): string {
  const normalizedMime = contentType.trim().toLowerCase()

  if (normalizedMime === 'application/pdf') {
    return 'pdf'
  }
  if (normalizedMime === 'image/jpeg') {
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

  if (explicitExtension) {
    const sanitized = sanitizeExtension(explicitExtension)
    if (sanitized) {
      return sanitized
    }
  }

  if (fileName) {
    const parts = fileName.split('.')
    if (parts.length > 1) {
      const sanitized = sanitizeExtension(parts[parts.length - 1] ?? '')
      if (sanitized) {
        return sanitized
      }
    }
  }

  return 'jpg'
}

/**
 * Enforces receipt file business rules (non-empty, max 5 MB, allowed MIME type)
 * and returns normalized metadata ready for storage.
 */
export function validateReceiptFile(
  input: ReceiptFileValidationInput
): ValidatedReceiptFile {
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new ReceiptPolicyError(
      'EMPTY_FILE',
      'Receipt file buffer cannot be empty',
      'Debes adjuntar una imagen o PDF del comprobante.'
    )
  }

  if (input.sizeBytes > MAX_RECEIPT_SIZE_BYTES) {
    throw new ReceiptPolicyError(
      'FILE_TOO_LARGE',
      `Receipt file exceeds maximum size of ${MAX_RECEIPT_SIZE_BYTES} bytes`,
      'El archivo no puede superar los 5 MB.'
    )
  }

  const normalizedMime = input.contentType.trim().toLowerCase()
  if (!isAllowedReceiptMimeType(normalizedMime)) {
    throw new ReceiptPolicyError(
      'UNSUPPORTED_MIME_TYPE',
      `Unsupported receipt MIME type: ${input.contentType}`,
      'Solo se permiten imágenes o archivos PDF.'
    )
  }

  return {
    contentType: normalizedMime,
    extension: resolveReceiptExtension(
      normalizedMime,
      input.fileName,
      input.extension
    ),
    receiptType: resolveReceiptTypeFromMime(normalizedMime),
  }
}
