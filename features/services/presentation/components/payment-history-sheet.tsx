'use client'

import { useState } from 'react'
import { EyeIcon, FileTextIcon, ImageIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatPeriodLabel } from '@/core/domain/period'
import type { EnrichedService } from '@/features/services/application/get-services-board.use-case'
import type { ServicePayment } from '@/features/services/domain/service.entity'
import { getReceiptPreviewAction } from '@/features/services/presentation/actions/service.actions'
import { ReceiptPreviewModal } from '@/features/services/presentation/components/receipt-preview-modal'

interface PaymentHistorySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: EnrichedService | null
}

function formatPaidAtDate(paidAt: Date | string): string {
  const date = typeof paidAt === 'string' ? new Date(paidAt) : paidAt
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
  }).format(date)
}

function buildDownloadFileName(
  serviceName: string,
  payment: ServicePayment
): string {
  const slug =
    serviceName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'servicio'
  const extension = payment.receiptType === 'PDF' ? 'pdf' : 'jpg'
  return `comprobante-${slug}-${payment.period}.${extension}`
}

export function PaymentHistorySheet({
  open,
  onOpenChange,
  service,
}: PaymentHistorySheetProps) {
  const [selectedPayment, setSelectedPayment] = useState<ServicePayment | null>(
    null
  )
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  if (!service) {
    return null
  }

  async function handleOpenPreview(payment: ServicePayment) {
    setSelectedPayment(payment)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewOpen(true)

    if (!payment.receiptPath) {
      if (payment.receiptUrl) {
        setPreviewUrl(payment.receiptUrl)
        return
      }
      setPreviewError('Este pago no tiene una ruta de comprobante asociada.')
      return
    }

    setIsLoadingPreview(true)
    const result = await getReceiptPreviewAction(payment.receiptPath)
    setIsLoadingPreview(false)

    if (!result.ok) {
      setPreviewError(result.error)
      return
    }

    setPreviewUrl(result.url)
  }

  function handlePreviewOpenChange(nextOpen: boolean) {
    setPreviewOpen(nextOpen)
    if (!nextOpen) {
      setPreviewUrl(null)
      setPreviewError(null)
      setIsLoadingPreview(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Historial de recibos — {service.name}</SheetTitle>
            <SheetDescription>
              Comprobantes registrados ordenados del periodo más reciente al más
              antiguo.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-3 px-4 pb-6">
            {service.payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                <p className="text-sm font-medium">
                  Aún no hay recibos registrados
                </p>
                <p className="mt-1 text-xs">
                  Cuando subas un comprobante para este servicio aparecerá aquí.
                </p>
              </div>
            ) : (
              service.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      {payment.receiptType === 'PDF' ? (
                        <FileTextIcon className="size-4 text-primary" />
                      ) : (
                        <ImageIcon className="size-4 text-primary" />
                      )}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {formatPeriodLabel(payment.period)}
                        </span>
                        <Badge variant="outline">
                          {payment.receiptType === 'PDF' ? 'PDF' : 'Imagen'}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Pagado el {formatPaidAtDate(payment.paidAt)}
                      </span>
                    </div>
                  </div>

                  {Boolean(payment.receiptPath || payment.receiptUrl) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenPreview(payment)}
                    >
                      <EyeIcon className="size-3.5" />
                      <span>Ver comprobante</span>
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ReceiptPreviewModal
        open={previewOpen}
        onOpenChange={handlePreviewOpenChange}
        title={
          selectedPayment
            ? `${service.name} — ${formatPeriodLabel(selectedPayment.period)}`
            : service.name
        }
        subtitle={
          selectedPayment
            ? `Pagado el ${formatPaidAtDate(selectedPayment.paidAt)}`
            : undefined
        }
        previewUrl={previewUrl}
        fileType={selectedPayment?.receiptType}
        fileName={
          selectedPayment
            ? buildDownloadFileName(service.name, selectedPayment)
            : undefined
        }
        isLoading={isLoadingPreview}
        errorMessage={previewError}
      />
    </>
  )
}
