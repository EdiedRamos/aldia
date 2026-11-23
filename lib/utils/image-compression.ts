import {
  convertImageFileToWebp,
  DEFAULT_IMAGE_MAX_DIMENSION,
  DEFAULT_WEBP_QUALITY,
  HEIC_CONVERSION_ERROR_MESSAGE,
  isHeicFile,
} from '@/shared/utils/image-to-webp'

export const MAX_IMAGE_WIDTH = DEFAULT_IMAGE_MAX_DIMENSION
export const JPEG_QUALITY = DEFAULT_WEBP_QUALITY
export const HEIC_CONVERSION_QUALITY = DEFAULT_WEBP_QUALITY

export { HEIC_CONVERSION_ERROR_MESSAGE, isHeicFile }

export const IMAGE_FILE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'

export const RECEIPT_FILE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf'

const ALLOWED_CLIENT_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

const ALLOWED_CLIENT_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
])

export interface ImageCompressionOptions {
  maxWidth?: number
  quality?: number
}

export interface ClientFileValidationOptions {
  allowPdf: boolean
  maxSizeBytes: number
}

export type ClientFileValidationResult =
  { ok: true } | { ok: false; error: string }

function getLowerExtension(fileName: string): string {
  const parts = fileName.trim().toLowerCase().split('.')
  if (parts.length < 2) {
    return ''
  }
  return parts[parts.length - 1] ?? ''
}

/**
 * Validates a user-selected `File` immediately on `<input type="file">` change,
 * rejecting disallowed formats and oversized files before any network activity.
 */
export function validateClientUploadFile(
  file: File,
  { allowPdf, maxSizeBytes }: ClientFileValidationOptions
): ClientFileValidationResult {
  if (file.size <= 0) {
    return {
      ok: false,
      error: 'El archivo seleccionado está vacío.',
    }
  }

  const mime = file.type.trim().toLowerCase()
  const ext = getLowerExtension(file.name)

  const isHeic = isHeicFile(file)
  const isAllowedPdf =
    allowPdf && (mime === 'application/pdf' || (mime === '' && ext === 'pdf'))
  const isAllowedImage =
    isHeic ||
    ALLOWED_CLIENT_IMAGE_MIME_TYPES.has(mime) ||
    (mime === '' && ALLOWED_CLIENT_IMAGE_EXTENSIONS.has(ext))

  if (!isAllowedImage && !isAllowedPdf) {
    return {
      ok: false,
      error: allowPdf
        ? 'Formato no permitido. Solo se aceptan imágenes JPG, PNG, WebP, HEIC/HEIF o archivos PDF.'
        : 'Formato no permitido. Solo se aceptan imágenes JPG, PNG, WebP o HEIC/HEIF.',
    }
  }

  if (file.size > maxSizeBytes) {
    const maxMb = Math.round((maxSizeBytes / (1024 * 1024)) * 10) / 10
    return {
      ok: false,
      error: `El archivo supera el tamaño máximo permitido de ${maxMb} MB.`,
    }
  }

  return { ok: true }
}

/**
 * Legacy wrapper delegating to `convertImageFileToWebp`.
 */
export async function compressImageInBrowser(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<File> {
  return convertImageFileToWebp(file, {
    maxDimension: options.maxWidth ?? DEFAULT_IMAGE_MAX_DIMENSION,
    quality: options.quality ?? DEFAULT_WEBP_QUALITY,
  })
}
