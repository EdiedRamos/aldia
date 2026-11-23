// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockHeicTo } = vi.hoisted(() => ({
  mockHeicTo: vi.fn(),
}))

vi.mock('heic-to/next', () => ({
  heicTo: mockHeicTo,
}))

import {
  compressImageInBrowser,
  HEIC_CONVERSION_ERROR_MESSAGE,
  isHeicFile,
  validateClientUploadFile,
} from '@/lib/utils/image-compression'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  mockHeicTo.mockReset()
})

describe('lib/utils/image-compression - HEIC detection & client validation', () => {
  it('detects HEIC/HEIF files by MIME type or extension even when file.type is empty', () => {
    expect(isHeicFile({ name: 'IMG_001.HEIC', type: '' })).toBe(true)
    expect(isHeicFile({ name: 'photo.heif', type: '' })).toBe(true)
    expect(isHeicFile({ name: 'photo', type: 'image/heic' })).toBe(true)
    expect(isHeicFile({ name: 'photo', type: 'image/heif' })).toBe(true)
    expect(isHeicFile({ name: 'photo.jpg', type: 'image/jpeg' })).toBe(false)
    expect(isHeicFile({ name: 'doc.pdf', type: 'application/pdf' })).toBe(false)
  })

  it('validates allowed client formats and rejects unsupported formats or oversized files immediately', () => {
    const max5Mb = 5 * 1024 * 1024
    const max2Mb = 2 * 1024 * 1024

    expect(
      validateClientUploadFile(
        new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' }),
        { allowPdf: true, maxSizeBytes: max5Mb }
      )
    ).toEqual({ ok: true })

    expect(
      validateClientUploadFile(
        new File(['heic'], 'IMG_1234.heic', { type: '' }),
        { allowPdf: false, maxSizeBytes: max2Mb }
      )
    ).toEqual({ ok: true })

    expect(
      validateClientUploadFile(
        new File(['%PDF'], 'recibo.pdf', { type: 'application/pdf' }),
        { allowPdf: true, maxSizeBytes: max5Mb }
      )
    ).toEqual({ ok: true })

    // PDF rejected when allowPdf is false (contacts avatar)
    expect(
      validateClientUploadFile(
        new File(['%PDF'], 'recibo.pdf', { type: 'application/pdf' }),
        { allowPdf: false, maxSizeBytes: max2Mb }
      ).ok
    ).toBe(false)

    // Unsupported formats (GIF, SVG, ZIP) rejected immediately
    expect(
      validateClientUploadFile(
        new File(['gif'], 'anim.gif', { type: 'image/gif' }),
        { allowPdf: true, maxSizeBytes: max5Mb }
      ).ok
    ).toBe(false)

    expect(
      validateClientUploadFile(
        new File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' }),
        { allowPdf: true, maxSizeBytes: max5Mb }
      ).ok
    ).toBe(false)

    expect(
      validateClientUploadFile(
        new File(['zip'], 'archive.zip', { type: 'application/zip' }),
        { allowPdf: true, maxSizeBytes: max5Mb }
      ).ok
    ).toBe(false)

    // Oversized file rejected immediately
    const oversized = new File([new Uint8Array(max2Mb + 1)], 'big.jpg', {
      type: 'image/jpeg',
    })
    const oversizedResult = validateClientUploadFile(oversized, {
      allowPdf: false,
      maxSizeBytes: max2Mb,
    })
    expect(oversizedResult.ok).toBe(false)
    if (!oversizedResult.ok) {
      expect(oversizedResult.error).toMatch(/2 MB/i)
    }
  })

  it('delegates HEIC files to convertImageFileToWebp (heic-to/next + WebP export) and throws Spanish error on failure', async () => {
    const convertedBlob = new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' })
    mockHeicTo.mockResolvedValue(convertedBlob)

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string
    ) => {
      if (tagName.toLowerCase() === 'canvas') {
        const canvas = originalCreateElement('canvas')
        vi.spyOn(canvas, 'getContext').mockReturnValue({
          drawImage: vi.fn(),
        } as unknown as CanvasRenderingContext2D)
        canvas.toBlob = ((callback: BlobCallback, type?: string) => {
          callback(new Blob(['webp-bytes'], { type: type ?? 'image/webp' }))
        }) as unknown as HTMLCanvasElement['toBlob']
        return canvas
      }
      return originalCreateElement(tagName)
    }) as typeof document.createElement)

    vi.stubGlobal(
      'createImageBitmap',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('Native HEIC unsupported'))
        .mockResolvedValueOnce({
          width: 1200,
          height: 800,
          close: vi.fn(),
        })
        .mockRejectedValue(new Error('Native HEIC unsupported'))
    )

    class MockImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => {
          this.onerror?.()
        })
      }
    }
    vi.stubGlobal('Image', MockImage)

    const heicFile = new File(['raw-heic'], 'IMG_9999.HEIC', { type: '' })
    const result = await compressImageInBrowser(heicFile)

    expect(mockHeicTo).toHaveBeenCalledWith({
      blob: heicFile,
      type: 'image/jpeg',
      quality: 0.85,
    })
    expect(result.type).toBe('image/webp')
    expect(result.name).toBe('IMG_9999.webp')

    // Conversion failure throws descriptive Spanish message
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mockHeicTo.mockRejectedValue(new Error('WASM decode error'))
    await expect(compressImageInBrowser(heicFile)).rejects.toThrow(
      HEIC_CONVERSION_ERROR_MESSAGE
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[convertImageFileToWebp] HEIC conversion failed:',
      'WASM decode error'
    )

    // PDF passes through untouched
    const pdfFile = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
    expect(await compressImageInBrowser(pdfFile)).toBe(pdfFile)
  })
})
