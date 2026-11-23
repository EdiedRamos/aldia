// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const { mockGetDocument, mockGlobalWorkerOptions } = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
  mockGlobalWorkerOptions: { workerSrc: '' },
}))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: mockGlobalWorkerOptions,
  getDocument: mockGetDocument,
}))

import { ReceiptPreviewModal } from '@/features/services/presentation/components/receipt-preview-modal'
import {
  computeCanvasRenderMetrics,
  PdfCanvasViewer,
} from '@/shared/components/PdfCanvasViewer'

function createMockPdfDocument(numPages: number) {
  const renderSpy = vi.fn(() => ({
    promise: Promise.resolve(),
    cancel: vi.fn(),
  }))
  const destroySpy = vi.fn(async () => {})

  const getPage = vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render: renderSpy,
  }))

  return {
    doc: {
      numPages,
      getPage,
      destroy: destroySpy,
    },
    renderSpy,
    destroySpy,
    getPage,
  }
}

beforeEach(() => {
  mockGetDocument.mockReset()
  mockGlobalWorkerOptions.workerSrc = ''
})

afterEach(() => {
  cleanup()
})

describe('computeCanvasRenderMetrics', () => {
  it('fits page width to container and scales backing store by devicePixelRatio', () => {
    const metrics = computeCanvasRenderMetrics({
      pageWidth: 600,
      pageHeight: 800,
      containerWidth: 300,
      devicePixelRatio: 2,
    })

    expect(metrics.cssWidth).toBe(300)
    expect(metrics.cssHeight).toBe(400)
    expect(metrics.canvasWidth).toBe(600)
    expect(metrics.canvasHeight).toBe(800)
    expect(metrics.renderScale).toBeCloseTo(1, 5)
  })

  it('caps devicePixelRatio at 2.5 to keep mobile Retina rendering sharp without excessive memory', () => {
    const metrics = computeCanvasRenderMetrics({
      pageWidth: 600,
      pageHeight: 800,
      containerWidth: 360,
      devicePixelRatio: 4,
    })

    expect(metrics.cssWidth).toBe(360)
    expect(metrics.cssHeight).toBe(480)
    expect(metrics.canvasWidth).toBe(900)
    expect(metrics.canvasHeight).toBe(1200)
  })

  it('caps total canvas pixels for oversized pages to avoid Safari iOS blank canvas limits', () => {
    const metrics = computeCanvasRenderMetrics({
      pageWidth: 4000,
      pageHeight: 4000,
      containerWidth: 3000,
      devicePixelRatio: 3,
    })

    expect(metrics.canvasWidth * metrics.canvasHeight).toBeLessThanOrEqual(
      16_000_000
    )
  })
})

describe('PdfCanvasViewer', () => {
  it('shows a loading state and renders all pages into HTML5 canvas elements without iframes', async () => {
    const { doc, renderSpy, destroySpy } = createMockPdfDocument(3)

    mockGetDocument.mockReturnValue({
      promise: Promise.resolve(doc),
      destroy: destroySpy,
    })

    const { container, unmount } = render(
      <PdfCanvasViewer
        url="https://storage.googleapis.com/bucket/recibo.pdf"
        title="Recibo de Energía"
      />
    )

    expect(screen.getByText('Cargando documento PDF...')).toBeTruthy()
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('embed')).toBeNull()
    expect(container.querySelector('object')).toBeNull()

    await waitFor(() => {
      const canvases = container.querySelectorAll('canvas')
      expect(canvases).toHaveLength(3)
    })

    expect(screen.getByText('3 páginas')).toBeTruthy()
    expect(screen.getByText('Página 1 de 3')).toBeTruthy()
    expect(screen.getByText('Página 3 de 3')).toBeTruthy()

    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledTimes(3)
    })

    unmount()
    expect(destroySpy).toHaveBeenCalledTimes(1)
  })

  it('respects maxPages in compact mode and shows remaining pages hint', async () => {
    const { doc } = createMockPdfDocument(3)

    mockGetDocument.mockReturnValue({
      promise: Promise.resolve(doc),
      destroy: vi.fn(async () => {}),
    })

    const { container } = render(
      <PdfCanvasViewer
        url="https://storage.googleapis.com/bucket/multipagina.pdf"
        compact
        maxPages={1}
      />
    )

    await waitFor(() => {
      expect(container.querySelectorAll('canvas')).toHaveLength(1)
    })

    expect(screen.getByText(/\+2 páginas adicionales/)).toBeTruthy()
  })

  it('displays an error fallback when PDF decoding fails', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.reject(new Error('Corrupt PDF')),
      destroy: vi.fn(async () => {}),
    })

    render(
      <PdfCanvasViewer url="https://storage.googleapis.com/bucket/corrupto.pdf" />
    )

    await waitFor(() => {
      expect(
        screen.getByText(/No se pudo renderizar el PDF en pantalla/)
      ).toBeTruthy()
    })
  })

  it('rejects unsafe URLs without invoking pdfjs', () => {
    render(<PdfCanvasViewer url="javascript:alert(1)" />)

    expect(screen.getByText('URL de PDF no válida')).toBeTruthy()
    expect(mockGetDocument).not.toHaveBeenCalled()
  })
})

describe('ReceiptPreviewModal with PdfCanvasViewer', () => {
  it('renders PdfCanvasViewer and header Descargar PDF button without iframes', async () => {
    const { doc } = createMockPdfDocument(2)
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve(doc),
      destroy: vi.fn(async () => {}),
    })

    render(
      <ReceiptPreviewModal
        open
        onOpenChange={vi.fn()}
        title="Agua — Enero 2026"
        subtitle="Pagado el 15 ene 2026"
        previewUrl="https://storage.googleapis.com/bucket/agua.pdf"
        fileType="PDF"
        fileName="comprobante-agua.pdf"
      />
    )

    expect(document.querySelector('iframe')).toBeNull()
    expect(
      document.querySelector('[data-slot="pdf-canvas-viewer"]')
    ).not.toBeNull()

    const header = document.querySelector('[data-slot="dialog-header"]')
    expect(header?.textContent).toContain('Descargar PDF')

    await waitFor(() => {
      expect(document.querySelectorAll('canvas')).toHaveLength(2)
    })
  })

  it('omits header download button when showHeaderDownload is false', () => {
    const { doc } = createMockPdfDocument(1)
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve(doc),
      destroy: vi.fn(async () => {}),
    })

    render(
      <ReceiptPreviewModal
        open
        onOpenChange={vi.fn()}
        title="Préstamo — Juan Pérez"
        previewUrl="https://storage.googleapis.com/bucket/abono.pdf"
        fileType="PDF"
        showHeaderDownload={false}
      />
    )

    const header = document.querySelector('[data-slot="dialog-header"]')
    expect(header?.textContent).not.toContain('Descargar PDF')

    const footer = document.querySelector('[data-slot="dialog-footer"]')
    expect(footer?.textContent).toContain('Descargar PDF')
  })
})
