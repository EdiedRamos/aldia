export const MAX_IMAGE_WIDTH = 1600
export const JPEG_QUALITY = 0.8

export interface ImageCompressionOptions {
  maxWidth?: number
  quality?: number
}

/**
 * Compresses an image file in the browser using HTML `<canvas>` to reduce upload size.
 * Non-image files (such as PDFs) are returned unchanged.
 */
export async function compressImageInBrowser(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file
  }

  const maxWidth = options.maxWidth ?? MAX_IMAGE_WIDTH
  const quality = options.quality ?? JPEG_QUALITY

  return new Promise<File>((resolve) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)

      let { width, height } = image
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext('2d')
      if (!context) {
        resolve(file)
        return
      }

      context.drawImage(image, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }

          const baseName = file.name.replace(/\.[^/.]+$/, '') || 'receipt'
          const compressedFile = new File([blob], `${baseName}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
          resolve(compressedFile)
        },
        'image/jpeg',
        quality
      )
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(file)
    }

    image.src = objectUrl
  })
}
