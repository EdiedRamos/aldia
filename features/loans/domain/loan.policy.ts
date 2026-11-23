export const MAX_LOAN_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024

export const ALLOWED_LOAN_RECEIPT_MIME_TYPES = [
  'image/webp',
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const

export const LOAN_RECEIPT_SIGNED_URL_TTL_SECONDS = 900

export type LoanReceiptType = 'IMAGE' | 'PDF'

export type LoanReceiptPolicyErrorCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MIME_TYPE'
  | 'INVALID_PATH_SEGMENT'
  | 'FORBIDDEN_RECEIPT_PATH'

export class LoanReceiptPolicyError extends Error {
  readonly code: LoanReceiptPolicyErrorCode
  readonly userMessage: string

  constructor(
    code: LoanReceiptPolicyErrorCode,
    message: string,
    userMessage: string
  ) {
    super(message)
    this.name = 'LoanReceiptPolicyError'
    this.code = code
    this.userMessage = userMessage
  }
}

export interface LoanReceiptFileValidationInput {
  sizeBytes: number
  contentType: string
  fileName?: string
  extension?: string
}

export interface ValidatedLoanReceiptFile {
  contentType: string
  extension: string
  receiptType: LoanReceiptType
}

/**
 * Checks whether a MIME type is allowed for loan receipts
 * (`image/jpeg`, `image/png`, `image/webp`, or `application/pdf`).
 */
export function isAllowedLoanReceiptMimeType(contentType: string): boolean {
  const normalized = contentType.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return ALLOWED_LOAN_RECEIPT_MIME_TYPES.includes(
    normalized as (typeof ALLOWED_LOAN_RECEIPT_MIME_TYPES)[number]
  )
}

export function resolveLoanReceiptTypeFromMime(
  contentType: string
): LoanReceiptType {
  return contentType.trim().toLowerCase() === 'application/pdf'
    ? 'PDF'
    : 'IMAGE'
}

export function resolveLoanReceiptTypeFromPath(
  receiptPath: string
): LoanReceiptType {
  return receiptPath.trim().toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMAGE'
}

function sanitizeSegment(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')

  return cleaned ? cleaned : null
}

function sanitizeExtension(rawExtension: string): string | null {
  const cleaned = rawExtension
    .trim()
    .replace(/^\.+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  return cleaned ? cleaned : null
}

export function resolveLoanReceiptExtension(
  contentType: string,
  fileName?: string,
  explicitExtension?: string
): string {
  const normalizedMime = contentType.trim().toLowerCase()

  if (normalizedMime === 'application/pdf') {
    return 'pdf'
  }
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
 * Builds the canonical private storage path for loan receipts:
 * `loans/${userId}/${loanId}/${filePrefix}.${ext}`.
 */
export function buildLoanReceiptPath(
  userId: string,
  loanId: string,
  filePrefix: string,
  extension: string
): string {
  const safeUserId = userId.trim()
  const safeLoanId = loanId.trim()
  const safePrefix = sanitizeSegment(filePrefix)

  if (
    !safeUserId ||
    !safeLoanId ||
    !safePrefix ||
    safeUserId.includes('/') ||
    safeUserId.includes('\\') ||
    safeUserId.includes('..') ||
    safeLoanId.includes('/') ||
    safeLoanId.includes('\\') ||
    safeLoanId.includes('..')
  ) {
    throw new LoanReceiptPolicyError(
      'INVALID_PATH_SEGMENT',
      'Invalid userId, loanId, or filePrefix for loan receipt path',
      'No se pudo construir la ruta del comprobante.'
    )
  }

  const sanitizedExt = sanitizeExtension(extension) ?? 'jpg'
  return `loans/${safeUserId}/${safeLoanId}/${safePrefix}.${sanitizedExt}`
}

/**
 * Verifies that a loan receipt storage path strictly belongs to the given `userId`
 * and does not attempt path traversal.
 */
export function isOwnedLoanReceiptPath(
  userId: string,
  receiptPath: string
): boolean {
  const safeUserId = userId.trim()
  const normalized = receiptPath.trim()
  if (
    !safeUserId ||
    !normalized ||
    normalized.includes('..') ||
    normalized.includes('\\') ||
    normalized.startsWith('/')
  ) {
    return false
  }

  return normalized.startsWith(`loans/${safeUserId}/`)
}

/**
 * Enforces loan receipt business rules (non-empty, max 5 MB, `image/*` or `application/pdf`).
 */
export function validateLoanReceiptFile(
  input: LoanReceiptFileValidationInput
): ValidatedLoanReceiptFile {
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new LoanReceiptPolicyError(
      'EMPTY_FILE',
      'Loan receipt file buffer cannot be empty',
      'El archivo del comprobante está vacío.'
    )
  }

  if (input.sizeBytes > MAX_LOAN_RECEIPT_SIZE_BYTES) {
    throw new LoanReceiptPolicyError(
      'FILE_TOO_LARGE',
      `Loan receipt file exceeds maximum size of ${MAX_LOAN_RECEIPT_SIZE_BYTES} bytes`,
      'El comprobante no puede superar los 5 MB.'
    )
  }

  const normalizedMime = input.contentType.trim().toLowerCase()
  if (!isAllowedLoanReceiptMimeType(normalizedMime)) {
    throw new LoanReceiptPolicyError(
      'UNSUPPORTED_MIME_TYPE',
      `Unsupported loan receipt MIME type: ${input.contentType}`,
      'Solo se permiten imágenes (JPG, PNG, WebP) o archivos PDF para los comprobantes.'
    )
  }

  return {
    contentType: normalizedMime,
    extension: resolveLoanReceiptExtension(
      normalizedMime,
      input.fileName,
      input.extension
    ),
    receiptType: resolveLoanReceiptTypeFromMime(normalizedMime),
  }
}
