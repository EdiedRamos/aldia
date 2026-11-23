// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    promise: new Promise(() => {}),
    destroy: vi.fn(async () => {}),
  })),
}))

import { ReceiptFileInput } from '@/components/receipt-file-input'

function createFile(name: string, type: string): File {
  return new File(['dummy-content'], name, { type })
}

afterEach(() => {
  cleanup()
})

describe('ReceiptFileInput preview URL validation', () => {
  it('renders PdfCanvasViewer (and no iframe) for PDFs with a valid same-origin blob: URL', () => {
    const pdfFile = createFile('comprobante.pdf', 'application/pdf')
    const safeBlobUrl = `blob:${window.location.origin}/pdf-preview-123`

    const { container } = render(
      <ReceiptFileInput
        id="receipt-pdf"
        file={pdfFile}
        previewUrl={safeBlobUrl}
        onFileChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(container.querySelector('iframe')).toBeNull()
    const viewer = container.querySelector('[data-slot="pdf-canvas-viewer"]')
    expect(viewer).not.toBeNull()
    expect(viewer?.getAttribute('data-pdf-url')).toBe(safeBlobUrl)
    expect(viewer?.getAttribute('aria-label')).toBe(
      'Vista previa de comprobante.pdf'
    )
  })

  it('renders an img for images with a valid same-origin blob: URL', () => {
    const imgFile = createFile('comprobante.jpg', 'image/jpeg')
    const safeBlobUrl = `blob:${window.location.origin}/img-preview-456`

    const { container } = render(
      <ReceiptFileInput
        id="receipt-img"
        file={imgFile}
        previewUrl={safeBlobUrl}
        onFileChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe(safeBlobUrl)
    expect(img?.getAttribute('alt')).toBe('Vista previa de comprobante.jpg')
  })

  it('renders PdfCanvasViewer for valid https: PDF URLs', () => {
    const pdfFile = createFile('soporte.pdf', 'application/pdf')
    const httpsUrl = 'https://storage.googleapis.com/bucket/soporte.pdf?sig=1'

    const { container } = render(
      <ReceiptFileInput
        id="receipt-https"
        file={pdfFile}
        previewUrl={httpsUrl}
        onFileChange={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(container.querySelector('iframe')).toBeNull()
    const viewer = container.querySelector('[data-slot="pdf-canvas-viewer"]')
    expect(viewer).not.toBeNull()
    expect(viewer?.getAttribute('data-pdf-url')).toBe(httpsUrl)
  })

  it.each([
    ['javascript: scheme', 'javascript:alert(1)'],
    ['data: HTML scheme', 'data:text/html,<script>alert(1)</script>'],
    ['insecure http: scheme', 'http://insecure.example.com/receipt.pdf'],
    ['cross-origin blob: URL', 'blob:https://evil.example.com/1234-5678'],
    ['malformed URL', 'not a valid url'],
  ])(
    'does not render pdf viewer, iframe, or img for unsafe previewUrl (%s)',
    (_label, unsafeUrl) => {
      const pdfFile = createFile('comprobante.pdf', 'application/pdf')
      const { container: pdfContainer, unmount: unmountPdf } = render(
        <ReceiptFileInput
          id="receipt-unsafe-pdf"
          file={pdfFile}
          previewUrl={unsafeUrl}
          onFileChange={vi.fn()}
          onRemove={vi.fn()}
        />
      )

      expect(pdfContainer.querySelector('iframe')).toBeNull()
      expect(
        pdfContainer.querySelector('[data-slot="pdf-canvas-viewer"]')
      ).toBeNull()
      expect(pdfContainer.querySelector('img')).toBeNull()
      expect(pdfContainer.querySelector('label')).not.toBeNull()
      unmountPdf()

      const imgFile = createFile('comprobante.jpg', 'image/jpeg')
      const { container: imgContainer } = render(
        <ReceiptFileInput
          id="receipt-unsafe-img"
          file={imgFile}
          previewUrl={unsafeUrl}
          onFileChange={vi.fn()}
          onRemove={vi.fn()}
        />
      )

      expect(imgContainer.querySelector('iframe')).toBeNull()
      expect(imgContainer.querySelector('img')).toBeNull()
      expect(imgContainer.querySelector('label')).not.toBeNull()
    }
  )
})
