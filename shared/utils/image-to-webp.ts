export const DEFAULT_IMAGE_MAX_DIMENSION = 1600
export const AVATAR_IMAGE_MAX_DIMENSION = 512
export const DEFAULT_WEBP_QUALITY = 0.85

export const HEIC_CONVERSION_ERROR_MESSAGE =
  'No se pudo procesar la imagen HEIC. Intenta subirla en formato JPG o PNG.'

export const IMAGE_CONVERSION_ERROR_MESSAGE =
  'No se pudo procesar la imagen seleccionada. Verifica que el archivo sea válido e inténtalo de nuevo.'

export interface ConvertImageToWebpOptions {
  maxDimension?: number
  quality?: number
}

interface DecodedImageSource {
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}

function getLowerExtension(fileName: string): string {
  const parts = fileName.trim().toLowerCase().split('.')
  if (parts.length < 2) {
    return ''
  }
  return parts[parts.length - 1] ?? ''
}

function replaceFileExtension(
  fileName: string,
  extension: string,
  fallback = 'image'
): string {
  const trimmed = fileName.trim()
  const baseName = trimmed.replace(/\.[^/.]+$/, '').trim() || fallback
  return `${baseName}.${extension}`
}

function isPdfFile(file: Pick<File, 'type' | 'name'>): boolean {
  const mime = file.type.trim().toLowerCase()
  if (mime === 'application/pdf') {
    return true
  }

  return mime === '' && getLowerExtension(file.name) === 'pdf'
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

function computeTargetDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number
): { width: number; height: number } {
  const largestSide = Math.max(sourceWidth, sourceHeight)
  if (largestSide <= maxDimension) {
    return { width: sourceWidth, height: sourceHeight }
  }

  const scale = maxDimension / largestSide
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality)
  })
}

async function decodeImageSource(
  blob: Blob
): Promise<DecodedImageSource | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => bitmap.close(),
        }
      }
      bitmap.close()
    } catch {
      // Fall through to HTMLImageElement decoding
    }
  }

  return new Promise<DecodedImageSource | null>((resolve) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(blob)

    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (width <= 0 || height <= 0) {
        URL.revokeObjectURL(objectUrl)
        resolve(null)
        return
      }

      resolve({
        source: image,
        width,
        height,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      })
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }

    image.src = objectUrl
  })
}

async function decodeHeicBlob(file: File, quality: number): Promise<Blob> {
  try {
    const { heicTo } = await import('heic-to/next')
    const decodedBlob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality,
    })

    if (!(decodedBlob instanceof Blob) || decodedBlob.size === 0) {
      throw new Error('heic-to returned an empty blob')
    }

    return decodedBlob
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('[convertImageFileToWebp] HEIC conversion failed:', detail)
    throw new Error(HEIC_CONVERSION_ERROR_MESSAGE)
  }
}

async function renderSourceToWebpFile(
  decoded: DecodedImageSource,
  fileName: string,
  maxDimension: number,
  quality: number
): Promise<File> {
  const { width, height } = computeTargetDimensions(
    decoded.width,
    decoded.height,
    maxDimension
  )

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error(IMAGE_CONVERSION_ERROR_MESSAGE)
  }

  context.drawImage(decoded.source, 0, 0, width, height)

  const webpBlob = await canvasToBlob(canvas, 'image/webp', quality)
  if (webpBlob && (webpBlob.type === '' || webpBlob.type === 'image/webp')) {
    return new File([webpBlob], replaceFileExtension(fileName, 'webp'), {
      type: 'image/webp',
      lastModified: Date.now(),
    })
  }

  // Safe fallback to JPEG only when WebP encoding is unavailable (toBlob returns null or non-WebP).
  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality)
  if (jpegBlob) {
    return new File([jpegBlob], replaceFileExtension(fileName, 'jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  }

  throw new Error(IMAGE_CONVERSION_ERROR_MESSAGE)
}

/**
 * Converts a browser-selected image `File` to WebP (`image/webp`) before preview or upload.
 * - PDFs (`application/pdf`) are returned unchanged.
 * - `.heic` / `.heif` images are decoded first (natively when supported, otherwise via `heic-to/next`).
 * - Images whose largest dimension exceeds `maxDimension` (default: 1600 px) are resized proportionally.
 * - Falls back to `image/jpeg` only if `canvas.toBlob(..., 'image/webp')` returns `null` or is unsupported.
 */
export async function convertImageFileToWebp(
  file: File,
  options: ConvertImageToWebpOptions = {}
): Promise<File> {
  if (isPdfFile(file)) {
    return file
  }

  const maxDimension =
    typeof options.maxDimension === 'number' && options.maxDimension > 0
      ? options.maxDimension
      : DEFAULT_IMAGE_MAX_DIMENSION
  const quality =
    typeof options.quality === 'number' &&
    options.quality > 0 &&
    options.quality <= 1
      ? options.quality
      : DEFAULT_WEBP_QUALITY

  const heic = isHeicFile(file)
  const mime = file.type.trim().toLowerCase()

  if (!heic && mime !== '' && !mime.startsWith('image/')) {
    return file
  }

  let decoded: DecodedImageSource | null = null

  if (heic) {
    // 1. Try native browser decoding first (handles Safari/macOS and `.heic`-named JPEGs instantly).
    decoded = await decodeImageSource(file)

    // 2. Fall back to `heic-to/next` WebAssembly decoding (supports modern iOS 17/18+ HEIC).
    if (!decoded) {
      const decodedHeicBlob = await decodeHeicBlob(file, quality)
      decoded = await decodeImageSource(decodedHeicBlob)
    }
  } else {
    decoded = await decodeImageSource(file)
  }

  if (!decoded) {
    throw new Error(IMAGE_CONVERSION_ERROR_MESSAGE)
  }

  try {
    return await renderSourceToWebpFile(
      decoded,
      file.name,
      maxDimension,
      quality
    )
  } finally {
    decoded.cleanup()
  }
}
