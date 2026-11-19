'use client'

import { useState } from 'react'
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
  LoaderCircleIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ReceiptType } from '@/features/services/domain/service.entity'
import {
  parseSafeDownloadUrl,
  triggerSafeFileDownload,
} from '@/lib/utils/safe-download'

export interface ReceiptPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  previewUrl: string | null
  fileType?: ReceiptType | string
  fileName?: string
  isLoading?: boolean
  errorMessage?: string | null
}

/**
 * Resolves whether the given receipt file type or path corresponds to a PDF document.
 */
function isPdfReceipt(
  fileType?: ReceiptType | string,
  previewUrl?: string | null,
  fileName?: string
): boolean {
  if (!fileType && !previewUrl && !fileName) {
    return false
  }

  const normalizedType = (fileType ?? '').toLowerCase()
  if (normalizedType === 'pdf' || normalizedType === 'application/pdf') {
    return true
  }

  const normalizedName = (fileName ?? '').toLowerCase()
  if (normalizedName.endsWith('.pdf')) {
    return true
  }

  const cleanUrl = (previewUrl ?? '').split('?')[0]?.toLowerCase() ?? ''
  return cleanUrl.endsWith('.pdf')
}

export function ReceiptPreviewModal({
  open,
  onOpenChange,
  title,
  subtitle,
  previewUrl,
  fileType,
  fileName = 'comprobante',
  isLoading = false,
  errorMessage = null,
}: ReceiptPreviewModalProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const safeParsedUrl = parseSafeDownloadUrl(previewUrl)
  const safeUrlString = safeParsedUrl ? safeParsedUrl.toString() : null
  const isPdf = isPdfReceipt(fileType, safeUrlString, fileName)

  async function handleDownload() {
    if (!previewUrl) {
      return
    }

    const parsedUrl = parseSafeDownloadUrl(previewUrl)
    if (!parsedUrl) {
      return
    }

    if (parsedUrl.protocol === 'blob:') {
      triggerSafeFileDownload(parsedUrl.toString(), fileName)
      return
    }

    const validatedHttpsUrl = parsedUrl.toString()

    setIsDownloading(true)
    try {
      const response = await fetch(validatedHttpsUrl)
      if (!response.ok) {
        throw new Error('Failed to fetch receipt blob')
      }
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)

      try {
        triggerSafeFileDownload(blobUrl, fileName)
      } finally {
        URL.revokeObjectURL(blobUrl)
      }
    } catch {
      window.open(validatedHttpsUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{title}</DialogTitle>
            <Badge variant="outline" className="gap-1">
              {isPdf ? (
                <>
                  <FileTextIcon className="size-3" />
                  <span>PDF</span>
                </>
              ) : (
                <>
                  <ImageIcon className="size-3" />
                  <span>Imagen</span>
                </>
              )}
            </Badge>
          </div>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>

        <div className="flex min-h-72 w-full items-center justify-center overflow-hidden rounded-xl border bg-muted/30 p-2">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <LoaderCircleIcon className="size-7 animate-spin text-primary" />
              <span className="text-xs">Cargando comprobante...</span>
            </div>
          ) : errorMessage ? (
            <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
              <p className="text-sm font-medium text-destructive">
                {errorMessage}
              </p>
              <p className="text-xs text-muted-foreground">
                Intenta cerrar y volver a abrir el comprobante.
              </p>
            </div>
          ) : safeUrlString ? (
            isPdf ? (
              <iframe
                src={safeUrlString}
                title={title}
                className="h-[68vh] w-full rounded-lg border-0 bg-background"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={safeUrlString}
                alt={title}
                className="max-h-[68vh] w-auto max-w-full rounded-lg object-contain"
              />
            )
          ) : (
            <p className="py-12 text-xs text-muted-foreground">
              No hay comprobante disponible para previsualizar.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>

          {safeUrlString && !isLoading && !errorMessage && (
            <>
              <Button
                type="button"
                variant="outline"
                nativeButton={false}
                render={
                  <a
                    href={safeUrlString}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <ExternalLinkIcon className="size-3.5" />
                <span>Abrir en pestaña</span>
              </Button>

              <Button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                <DownloadIcon className="size-3.5" />
                <span>{isDownloading ? 'Descargando...' : 'Descargar'}</span>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
