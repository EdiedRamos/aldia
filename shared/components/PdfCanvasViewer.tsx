'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircleIcon, LoaderCircleIcon } from 'lucide-react'
import { cn } from 'cn'
import type {
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist/types/src/display/api'

import { parseSafeDownloadUrl } from '@/lib/utils/safe-download'

const MAX_DEVICE_PIXEL_RATIO = 2.5
const MAX_CANVAS_PIXELS = 16_000_000
const FALLBACK_CONTAINER_WIDTH = 320
const WIDTH_CHANGE_THRESHOLD_PX = 2

export interface CanvasRenderMetrics {
  cssWidth: number
  cssHeight: number
  renderScale: number
  canvasWidth: number
  canvasHeight: number
}

/**
 * Computes responsive CSS dimensions and crisp Retina backing-store dimensions
 * for a PDF page while capping total pixels to stay safely within Safari iOS canvas limits.
 */
export function computeCanvasRenderMetrics({
  pageWidth,
  pageHeight,
  containerWidth,
  devicePixelRatio,
}: {
  pageWidth: number
  pageHeight: number
  containerWidth: number
  devicePixelRatio: number
}): CanvasRenderMetrics {
  const safePageWidth = Math.max(pageWidth, 1)
  const safePageHeight = Math.max(pageHeight, 1)
  const safeContainerWidth = Math.max(containerWidth, 1)

  const cssScale = safeContainerWidth / safePageWidth
  const cssWidth = Math.max(1, Math.floor(safePageWidth * cssScale))
  const cssHeight = Math.max(1, Math.floor(safePageHeight * cssScale))

  const normalizedDpr = Math.min(
    Math.max(Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1, 1),
    MAX_DEVICE_PIXEL_RATIO
  )

  let renderScale = cssScale * normalizedDpr
  const projectedPixels =
    safePageWidth * renderScale * (safePageHeight * renderScale)

  if (projectedPixels > MAX_CANVAS_PIXELS) {
    renderScale *= Math.sqrt(MAX_CANVAS_PIXELS / projectedPixels)
  }

  return {
    cssWidth,
    cssHeight,
    renderScale,
    canvasWidth: Math.max(1, Math.floor(safePageWidth * renderScale)),
    canvasHeight: Math.max(1, Math.floor(safePageHeight * renderScale)),
  }
}

export interface PdfCanvasViewerProps {
  /** Validated `blob:` (same-origin) or `https:` URL of the PDF document */
  url: string
  /** Accessible document title */
  title?: string
  /** Compact mode for inline previews (e.g., upload inputs) */
  compact?: boolean
  /** Optional cap on rendered pages (defaults to rendering all pages) */
  maxPages?: number
  /** Extra classes for the outer viewer container */
  className?: string
}

interface PdfPageCanvasProps {
  pdfDoc: PDFDocumentProxy
  pageNumber: number
  totalPages: number
  targetWidth: number
  compact: boolean
}

function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  totalPages,
  targetWidth,
  compact,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [renderedKey, setRenderedKey] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const currentKey = `${pageNumber}:${targetWidth}`
  const isRendering = renderedKey !== currentKey && pageError === null

  useEffect(() => {
    let cancelled = false
    let renderTask: RenderTask | null = null

    async function renderPage() {
      const canvas = canvasRef.current
      if (!canvas || targetWidth <= 0) {
        return
      }

      try {
        const page = await pdfDoc.getPage(pageNumber)
        if (cancelled) {
          return
        }

        const unscaledViewport = page.getViewport({ scale: 1 })
        const metrics = computeCanvasRenderMetrics({
          pageWidth: unscaledViewport.width,
          pageHeight: unscaledViewport.height,
          containerWidth: targetWidth,
          devicePixelRatio:
            typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
        })

        const renderViewport = page.getViewport({ scale: metrics.renderScale })

        canvas.width = Math.max(1, Math.floor(renderViewport.width))
        canvas.height = Math.max(1, Math.floor(renderViewport.height))
        canvas.style.width = `${metrics.cssWidth}px`
        canvas.style.height = `${metrics.cssHeight}px`

        renderTask = page.render({
          canvas,
          viewport: renderViewport,
        })

        await renderTask.promise

        if (!cancelled) {
          setPageError(null)
          setRenderedKey(currentKey)
        }
      } catch (error) {
        if (cancelled) {
          return
        }
        const errorName =
          error instanceof Error ? error.name : String(error ?? '')
        if (errorName === 'RenderingCancelledException') {
          return
        }
        setPageError(`No se pudo renderizar la página ${pageNumber}.`)
      }
    }

    void renderPage()

    return () => {
      cancelled = true
      if (renderTask) {
        renderTask.cancel()
      }
    }
  }, [pdfDoc, pageNumber, targetWidth, currentKey])

  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <div
        className={cn(
          'relative flex w-full justify-center overflow-hidden rounded-lg border bg-white shadow-xs',
          isRendering && 'min-h-40 items-center'
        )}
      >
        {pageError ? (
          <div className="flex items-center gap-2 p-6 text-xs text-destructive">
            <AlertCircleIcon className="size-4 shrink-0" />
            <span>{pageError}</span>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Página ${pageNumber} de ${totalPages}`}
              className="block max-w-full"
            />
            {isRendering && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60">
                <LoaderCircleIcon className="size-5 animate-spin text-primary" />
              </div>
            )}
          </>
        )}
      </div>
      {!compact && totalPages > 1 && (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          Página {pageNumber} de {totalPages}
        </span>
      )}
    </div>
  )
}

interface LoadedDocumentState {
  url: string
  pdfDoc: PDFDocumentProxy | null
  totalPages: number
  errorMessage: string | null
}

let pdfWorkerConfigured = false

export function PdfCanvasViewer({
  url,
  title = 'Documento PDF',
  compact = false,
  maxPages,
  className,
}: PdfCanvasViewerProps) {
  const measureRef = useRef<HTMLDivElement | null>(null)
  const [measuredWidth, setMeasuredWidth] = useState<number>(0)
  const [docState, setDocState] = useState<LoadedDocumentState | null>(null)

  const safeParsedUrl = parseSafeDownloadUrl(url)
  const safeUrl = safeParsedUrl ? safeParsedUrl.toString() : null

  // Observe available inner width so every PDF page adapts cleanly on mobile and desktop resizes
  useEffect(() => {
    const element = measureRef.current
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }
      const nextWidth = Math.floor(entry.contentRect.width)
      if (nextWidth <= 0) {
        return
      }
      setMeasuredWidth((prev) =>
        Math.abs(prev - nextWidth) >= WIDTH_CHANGE_THRESHOLD_PX
          ? nextWidth
          : prev
      )
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  // Load and decode the PDF document on the client using pdfjs-dist legacy build for mobile Safari/Android compatibility
  useEffect(() => {
    if (!safeUrl) {
      return
    }

    let cancelled = false
    let activeLoadingTask: { destroy: () => Promise<void> } | null = null

    async function loadPdf() {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        if (cancelled) {
          return
        }

        if (!pdfWorkerConfigured && !pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString()
          pdfWorkerConfigured = true
        }

        const loadingTask = pdfjs.getDocument({
          url: safeUrl!,
        })
        activeLoadingTask = loadingTask

        const pdfDoc = await loadingTask.promise
        if (cancelled) {
          void loadingTask.destroy()
          return
        }

        // Capture current DOM width as fallback when ResizeObserver hasn't fired yet (e.g. jsdom)
        const currentClientWidth = Math.floor(
          measureRef.current?.clientWidth ?? 0
        )
        if (currentClientWidth > 0) {
          setMeasuredWidth((prev) => (prev > 0 ? prev : currentClientWidth))
        }

        setDocState({
          url: safeUrl!,
          pdfDoc,
          totalPages: pdfDoc.numPages,
          errorMessage: null,
        })
      } catch {
        if (cancelled) {
          return
        }
        setDocState({
          url: safeUrl!,
          pdfDoc: null,
          totalPages: 0,
          errorMessage:
            'No se pudo renderizar el PDF en pantalla. Puedes descargarlo o abrirlo en una nueva pestaña.',
        })
      }
    }

    void loadPdf()

    return () => {
      cancelled = true
      if (activeLoadingTask) {
        void activeLoadingTask.destroy()
      }
    }
  }, [safeUrl])

  if (!safeUrl) {
    return (
      <div
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1 px-4 py-10 text-center',
          className
        )}
      >
        <AlertCircleIcon className="size-6 text-destructive" />
        <p className="text-sm font-medium text-destructive">
          URL de PDF no válida
        </p>
      </div>
    )
  }

  const isCurrentUrl = docState?.url === safeUrl
  const isLoading = !isCurrentUrl
  const errorMessage = isCurrentUrl ? docState.errorMessage : null
  const pdfDoc = isCurrentUrl ? docState.pdfDoc : null
  const totalPages = isCurrentUrl ? docState.totalPages : 0

  const pagesToRenderCount =
    maxPages && maxPages > 0 ? Math.min(totalPages, maxPages) : totalPages
  const pageNumbers = Array.from(
    { length: pagesToRenderCount },
    (_, index) => index + 1
  )
  const effectiveWidth =
    measuredWidth > 0 ? measuredWidth : FALLBACK_CONTAINER_WIDTH

  return (
    <div
      data-slot="pdf-canvas-viewer"
      data-pdf-url={safeUrl}
      aria-label={title}
      className={cn(
        'w-full overflow-x-hidden overflow-y-auto',
        compact ? 'max-h-52 p-1.5' : 'max-h-[65vh] p-1 sm:p-2',
        className
      )}
    >
      <div ref={measureRef} className="flex w-full flex-col items-center gap-3">
        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'flex w-full flex-col items-center justify-center gap-2 text-muted-foreground',
              compact ? 'py-10' : 'py-16'
            )}
          >
            <LoaderCircleIcon className="size-7 animate-spin text-primary" />
            <span className="text-xs font-medium">
              Cargando documento PDF...
            </span>
          </div>
        ) : errorMessage || !pdfDoc ? (
          <div
            role="alert"
            className={cn(
              'flex w-full flex-col items-center justify-center gap-1.5 px-4 text-center',
              compact ? 'py-8' : 'py-14'
            )}
          >
            <AlertCircleIcon className="size-6 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              {errorMessage ?? 'No se pudo cargar el documento PDF.'}
            </p>
          </div>
        ) : (
          <>
            {!compact && totalPages > 1 && (
              <div className="flex w-full items-center justify-between px-1 text-[11px] text-muted-foreground">
                <span className="truncate">{title}</span>
                <span className="shrink-0 tabular-nums">
                  {totalPages} páginas
                </span>
              </div>
            )}

            {pageNumbers.map((pageNumber) => (
              <PdfPageCanvas
                key={pageNumber}
                pdfDoc={pdfDoc}
                pageNumber={pageNumber}
                totalPages={totalPages}
                targetWidth={effectiveWidth}
                compact={compact}
              />
            ))}

            {compact && totalPages > pagesToRenderCount && (
              <p className="pb-1 text-center text-[11px] text-muted-foreground">
                +{totalPages - pagesToRenderCount}{' '}
                {totalPages - pagesToRenderCount === 1
                  ? 'página adicional'
                  : 'páginas adicionales'}{' '}
                · Pulsa Ampliar para ver el documento completo
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
