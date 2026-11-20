export const MAX_IMAGE_WIDTH = 1600
export const JPEG_QUALITY = 0.8
export const HEIC_CONVERSION_QUALITY = 0.85

export const HEIC_CONVERSION_ERROR_MESSAGE =
  'No se pudo procesar la imagen HEIC. Intenta subirla en formato JPG o PNG.'

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

function toJpgFileName(fileName: string, fallback = 'image'): string {
  const baseName = fileName.replace(/\.[^/.]+$/, '').trim() || fallback
  return `${baseName}.jpg`
}

/**
 * Detects HEIC / HEIF files either by MIME type or by file extension
 * (handles browsers where `.heic` / `.heif` reports an empty `file.type`).
 */
export function isHeicFile(file: Pick<File, 'type' | 'name'>): boolean {
  const mime = file.type.trim().toLowerCase()
  if (mime === 'image/heic' || mime === 'image/heif') {
    return true
  }

  const ext = getLowerExtension(file.name)
  return ext === 'heic' || ext === 'heif'
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

function renderToJpegFile(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  fileName: string,
  maxWidth: number,
  quality: number
): Promise<File | null> {
  return new Promise<File | null>((resolve) => {
    let width = sourceWidth
    let height = sourceHeight

    if (width <= 0 || height <= 0) {
      resolve(null)
      return
    }

    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width)
      width = maxWidth
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      resolve(null)
      return
    }

    context.drawImage(source, 0, 0, width, height)

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null)
          return
        }

        resolve(
          new File([blob], toJpgFileName(fileName, 'receipt'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
        )
      },
      'image/jpeg',
      quality
    )
  })
}

/**
 * Attempts to decode an image natively via browser `createImageBitmap` or `<img>`
 * and encode it as a compressed JPEG `File`. Returns `null` if the browser cannot
 * decode the format natively (e.g. HEIC on Chromium/Firefox).
 */
async function tryDecodeAndCompressNatively(
  file: File,
  maxWidth: number,
  quality: number
): Promise<File | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      try {
        const rendered = await renderToJpegFile(
          bitmap,
          bitmap.width,
          bitmap.height,
          file.name,
          maxWidth,
          quality
        )
        if (rendered) {
          return rendered
        }
      } finally {
        bitmap.close()
      }
    } catch {
      // Fall through to HTMLImageElement decoding
    }
  }

  return new Promise<File | null>((resolve) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      void renderToJpegFile(
        image,
        image.naturalWidth || image.width,
        image.naturalHeight || image.height,
        file.name,
        maxWidth,
        quality
      ).then(resolve)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }

    image.src = objectUrl
  })
}

async function convertHeicToJpegFile(file: File): Promise<File> {
  try {
    const { heicTo } = await import('heic-to/next')
    const jpegBlob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: HEIC_CONVERSION_QUALITY,
    })

    if (!(jpegBlob instanceof Blob) || jpegBlob.size === 0) {
      throw new Error('heic-to returned an empty blob')
    }

    return new File([jpegBlob], toJpgFileName(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('[compressImageInBrowser] HEIC conversion failed:', detail)
    throw new Error(HEIC_CONVERSION_ERROR_MESSAGE)
  }
}

/**
 * Compresses an image file in the browser using HTML `<canvas>` to reduce upload size.
 * Automatically decodes `.heic` / `.heif` images (first trying native browser decoding,
 * then `heic-to/next` WebAssembly with modern `libheif`) to JPEG before resizing.
 * Non-image files (such as PDFs) are returned unchanged.
 */
export async function compressImageInBrowser(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<File> {
  const maxWidth = options.maxWidth ?? MAX_IMAGE_WIDTH
  const quality = options.quality ?? JPEG_QUALITY

  let workingFile = file

  if (isHeicFile(file)) {
    // 1. Try native decoding first (handles Safari/macOS and `.heic`-named JPEGs instantly).
    const nativeDecoded = await tryDecodeAndCompressNatively(
      file,
      maxWidth,
      quality
    )
    if (nativeDecoded) {
      return nativeDecoded
    }

    // 2. Fall back to `heic-to/next` WebAssembly decoding (supports modern iOS 17/18+ HEIC).
    workingFile = await convertHeicToJpegFile(file)
  }

  if (!workingFile.type.startsWith('image/')) {
    return workingFile
  }

  const compressed = await tryDecodeAndCompressNatively(
    workingFile,
    maxWidth,
    quality
  )

  return compressed ?? workingFile
}
