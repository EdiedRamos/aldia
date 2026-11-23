// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockHeicTo } = vi.hoisted(() => ({
  mockHeicTo: vi.fn(),
}))

vi.mock('heic-to/next', () => ({
  heicTo: mockHeicTo,
}))

import {
  convertImageFileToWebp,
  HEIC_CONVERSION_ERROR_MESSAGE,
  IMAGE_CONVERSION_ERROR_MESSAGE,
  isHeicFile,
} from '@/shared/utils/image-to-webp'

interface CanvasMockSetup {
  canvas: HTMLCanvasElement
  drawImage: ReturnType<typeof vi.fn>
  toBlob: ReturnType<typeof vi.fn>
}

function setupCanvasMock(
  toBlobImpl?: (
    callback: BlobCallback,
    type?: string,
    quality?: number
  ) => void,
  withContext = true
): CanvasMockSetup {
  const drawImage = vi.fn()
  const toBlob = vi.fn(
    toBlobImpl ??
      ((callback: BlobCallback, type?: string) => {
        callback(new Blob(['encoded-bytes'], { type: type ?? 'image/webp' }))
      })
  )

  const originalCreateElement = document.createElement.bind(document)
  let createdCanvas: HTMLCanvasElement | null = null

  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    if (tagName.toLowerCase() === 'canvas') {
      const canvas = originalCreateElement('canvas')
      vi.spyOn(canvas, 'getContext').mockReturnValue(
        withContext
          ? ({ drawImage } as unknown as CanvasRenderingContext2D)
          : null
      )
      canvas.toBlob = toBlob as unknown as HTMLCanvasElement['toBlob']
      createdCanvas = canvas
      return canvas
    }
    return originalCreateElement(tagName)
  }) as typeof document.createElement)

  return {
    get canvas() {
      if (!createdCanvas) {
        throw new Error('Canvas was not created')
      }
      return createdCanvas
    },
    drawImage,
    toBlob,
  }
}

function mockImageBitmap(width: number, height: number) {
  const close = vi.fn()
  const createImageBitmapSpy = vi.fn().mockResolvedValue({
    width,
    height,
    close,
  })
  vi.stubGlobal('createImageBitmap', createImageBitmapSpy)
  return { createImageBitmapSpy, close }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  mockHeicTo.mockReset()
})

describe('shared/utils/image-to-webp', () => {
  it('returns PDF files completely untouched without touching canvas or decoders', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement')
    const pdfFile = new File(['%PDF-1.7'], 'recibo-enero.pdf', {
      type: 'application/pdf',
    })

    const result = await convertImageFileToWebp(pdfFile)

    expect(result).toBe(pdfFile)
    expect(result.name).toBe('recibo-enero.pdf')
    expect(result.type).toBe('application/pdf')
    expect(createElementSpy).not.toHaveBeenCalled()
    expect(mockHeicTo).not.toHaveBeenCalled()
  })

  it('converts standard images to WebP, renames extension to .webp, and resizes proportionally when largest side exceeds maxDimension', async () => {
    const canvasMock = setupCanvasMock()
    const { close } = mockImageBitmap(3200, 1600)

    const jpegFile = new File(['jpeg-bytes'], 'comprobante.pago.JPG', {
      type: 'image/jpeg',
    })

    const result = await convertImageFileToWebp(jpegFile, {
      maxDimension: 1600,
    })

    expect(result).toBeInstanceOf(File)
    expect(result.name).toBe('comprobante.pago.webp')
    expect(result.type).toBe('image/webp')
    expect(canvasMock.canvas.width).toBe(1600)
    expect(canvasMock.canvas.height).toBe(800)
    expect(canvasMock.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 3200, height: 1600 }),
      0,
      0,
      1600,
      800
    )
    expect(canvasMock.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/webp',
      0.85
    )
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('resizes portrait images based on height and supports avatar maxDimension (512 px) without upscaling small images', async () => {
    // Portrait image exceeding 512 px height
    const portraitCanvas = setupCanvasMock()
    mockImageBitmap(600, 1024)

    const avatarFile = new File(['png-bytes'], 'avatar_maria.png', {
      type: 'image/png',
    })
    const resizedAvatar = await convertImageFileToWebp(avatarFile, {
      maxDimension: 512,
      quality: 0.8,
    })

    expect(resizedAvatar.name).toBe('avatar_maria.webp')
    expect(resizedAvatar.type).toBe('image/webp')
    expect(portraitCanvas.canvas.width).toBe(300)
    expect(portraitCanvas.canvas.height).toBe(512)
    expect(portraitCanvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/webp',
      0.8
    )

    vi.restoreAllMocks()
    vi.unstubAllGlobals()

    // Small image within maxDimension should NOT be upscaled
    const smallCanvas = setupCanvasMock()
    mockImageBitmap(300, 200)

    const smallFile = new File(['png-bytes'], 'sin-extension', {
      type: 'image/png',
    })
    const smallResult = await convertImageFileToWebp(smallFile, {
      maxDimension: 512,
    })

    expect(smallResult.name).toBe('sin-extension.webp')
    expect(smallResult.type).toBe('image/webp')
    expect(smallCanvas.canvas.width).toBe(300)
    expect(smallCanvas.canvas.height).toBe(200)
  })

  it('falls back to image/jpeg only when canvas.toBlob for image/webp returns null', async () => {
    const canvasMock = setupCanvasMock((callback, type) => {
      if (type === 'image/webp') {
        callback(null)
        return
      }
      callback(new Blob(['jpeg-fallback'], { type: 'image/jpeg' }))
    })
    mockImageBitmap(1000, 800)

    const pngFile = new File(['png-bytes'], 'captura.png', {
      type: 'image/png',
    })

    const result = await convertImageFileToWebp(pngFile)

    expect(canvasMock.toBlob).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      'image/webp',
      0.85
    )
    expect(canvasMock.toBlob).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      'image/jpeg',
      0.85
    )
    expect(result.type).toBe('image/jpeg')
    expect(result.name).toBe('captura.jpg')
  })

  it('decodes HEIC/HEIF files via heic-to/next when native decoding fails and converts the result to WebP', async () => {
    expect(isHeicFile({ name: 'IMG_001.HEIC', type: '' })).toBe(true)
    expect(isHeicFile({ name: 'photo.heif', type: '' })).toBe(true)
    expect(isHeicFile({ name: 'photo', type: 'image/heic' })).toBe(true)

    const convertedBlob = new Blob(['decoded-jpeg'], { type: 'image/jpeg' })
    mockHeicTo.mockResolvedValue(convertedBlob)

    setupCanvasMock()

    const createImageBitmapSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unsupported HEIC'))
      .mockResolvedValueOnce({
        width: 2400,
        height: 1200,
        close: vi.fn(),
      })
    vi.stubGlobal('createImageBitmap', createImageBitmapSpy)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-heic')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    class FailingNativeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => {
          this.onerror?.()
        })
      }
    }
    vi.stubGlobal('Image', FailingNativeImage)

    const heicFile = new File(['raw-heic'], 'IMG_9999.HEIC', { type: '' })
    const result = await convertImageFileToWebp(heicFile, {
      maxDimension: 1600,
    })

    expect(mockHeicTo).toHaveBeenCalledWith({
      blob: heicFile,
      type: 'image/jpeg',
      quality: 0.85,
    })
    expect(result.type).toBe('image/webp')
    expect(result.name).toBe('IMG_9999.webp')
  })

  it('throws descriptive Spanish errors on HEIC decoding failure, corrupt images, missing canvas context, or blob export failure', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-err')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new Error('Decode failed'))
    )

    class FailingImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => {
          this.onerror?.()
        })
      }
    }
    vi.stubGlobal('Image', FailingImage)

    // 1. HEIC conversion failure
    mockHeicTo.mockRejectedValue(new Error('WASM decode error'))
    const heicFile = new File(['raw-heic'], 'broken.heic', { type: '' })
    await expect(convertImageFileToWebp(heicFile)).rejects.toThrow(
      HEIC_CONVERSION_ERROR_MESSAGE
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[convertImageFileToWebp] HEIC conversion failed:',
      'WASM decode error'
    )

    // 2. Corrupt standard image (cannot decode)
    const corruptFile = new File(['not-an-image'], 'corrupt.jpg', {
      type: 'image/jpeg',
    })
    await expect(convertImageFileToWebp(corruptFile)).rejects.toThrow(
      IMAGE_CONVERSION_ERROR_MESSAGE
    )

    // 3. Missing 2D canvas context
    setupCanvasMock(undefined, false)
    mockImageBitmap(800, 600)
    const validFile = new File(['img'], 'photo.png', { type: 'image/png' })
    await expect(convertImageFileToWebp(validFile)).rejects.toThrow(
      IMAGE_CONVERSION_ERROR_MESSAGE
    )

    // 4. Both WebP and JPEG toBlob return null
    vi.restoreAllMocks()
    setupCanvasMock((callback) => {
      callback(null)
    })
    mockImageBitmap(800, 600)
    await expect(convertImageFileToWebp(validFile)).rejects.toThrow(
      IMAGE_CONVERSION_ERROR_MESSAGE
    )
  })
})
