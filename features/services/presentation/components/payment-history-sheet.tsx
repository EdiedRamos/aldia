'use client'

import { useState, useTransition } from 'react'
import {
  BanIcon,
  EyeIcon,
  FileTextIcon,
  ImageIcon,
  LoaderCircleIcon,
} from 'lucide-react'
import { toast } from 'sonner'

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
import { FieldError } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatPeriodLabel } from '@/core/domain/period'
import type { EnrichedService } from '@/features/services/application/get-services-board.use-case'
import {
  getLatestActiveServicePayment,
  getServicePaymentStatus,
  type ServicePayment,
} from '@/features/services/domain/service.entity'
import {
  getReceiptPreviewAction,
  voidServicePaymentAction,
} from '@/features/services/presentation/actions/service.actions'
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

  const [voidingPayment, setVoidingPayment] = useState<ServicePayment | null>(
    null
  )
  const [voidReason, setVoidReason] = useState('')
  const [voidError, setVoidError] = useState<string | null>(null)
  const [isVoiding, startVoidTransition] = useTransition()

  if (!service) {
    return null
  }

  const canVoidPayments = service.status === 'ACTIVE'
  const latestActivePaymentId = canVoidPayments
    ? (getLatestActiveServicePayment(service.id, service.payments)?.id ?? null)
    : null

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

  function openVoidDialog(payment: ServicePayment) {
    setVoidingPayment(payment)
    setVoidReason('')
    setVoidError(null)
  }

  function closeVoidDialog() {
    if (isVoiding) {
      return
    }
    setVoidingPayment(null)
    setVoidReason('')
    setVoidError(null)
  }

  function handleConfirmVoidPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!service || !voidingPayment) {
      return
    }

    const trimmedReason = voidReason.trim()
    if (trimmedReason.length < 3) {
      setVoidError('El motivo de anulación debe tener al menos 3 caracteres.')
      return
    }
    if (trimmedReason.length > 200) {
      setVoidError('El motivo de anulación no puede superar 200 caracteres.')
      return
    }

    setVoidError(null)

    startVoidTransition(async () => {
      const result = await voidServicePaymentAction({
        serviceId: service.id,
        paymentId: voidingPayment.id,
        reason: trimmedReason,
      })

      if (!result.ok) {
        setVoidError(result.error)
        return
      }

      toast.success('Pago anulado y periodo restaurado como pendiente.')
      setVoidingPayment(null)
      setVoidReason('')
      setVoidError(null)
    })
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
              service.payments.map((payment) => {
                const isVoided = getServicePaymentStatus(payment) === 'VOIDED'
                const canVoidThisPayment =
                  !isVoided &&
                  canVoidPayments &&
                  payment.id === latestActivePaymentId

                return (
                  <div
                    key={payment.id}
                    className={`flex flex-col gap-2 rounded-xl border p-3 ${
                      isVoided
                        ? 'border-dashed bg-muted/30 opacity-80'
                        : 'bg-card'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          {payment.receiptType === 'PDF' ? (
                            <FileTextIcon
                              className={`size-4 ${
                                isVoided
                                  ? 'text-muted-foreground'
                                  : 'text-primary'
                              }`}
                            />
                          ) : (
                            <ImageIcon
                              className={`size-4 ${
                                isVoided
                                  ? 'text-muted-foreground'
                                  : 'text-primary'
                              }`}
                            />
                          )}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`truncate text-sm font-medium ${
                                isVoided
                                  ? 'text-muted-foreground line-through'
                                  : ''
                              }`}
                            >
                              {formatPeriodLabel(payment.period)}
                            </span>
                            <Badge variant="outline">
                              {payment.receiptType === 'PDF' ? 'PDF' : 'Imagen'}
                            </Badge>
                            {isVoided && (
                              <Badge
                                variant="outline"
                                className="border-destructive/40 bg-destructive/10 text-destructive"
                              >
                                Anulado
                              </Badge>
                            )}
                          </div>
                          <span
                            className={`text-xs text-muted-foreground ${
                              isVoided ? 'line-through' : ''
                            }`}
                          >
                            Pagado el {formatPaidAtDate(payment.paidAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {Boolean(payment.receiptPath || payment.receiptUrl) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleOpenPreview(payment)}
                        >
                          <EyeIcon className="size-3.5" />
                          <span>Ver comprobante</span>
                        </Button>
                      )}

                      {canVoidThisPayment && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() => openVoidDialog(payment)}
                        >
                          <BanIcon className="size-3" />
                          <span>Anular pago</span>
                        </Button>
                      )}
                    </div>

                    {isVoided && payment.voidReason && (
                      <div className="rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Motivo de anulación:{' '}
                        </span>
                        <span>{payment.voidReason}</span>
                        {payment.voidedAt && (
                          <span className="ml-1.5 opacity-80">
                            ({formatPaidAtDate(payment.voidedAt)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
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

      <Dialog
        open={Boolean(voidingPayment)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeVoidDialog()
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!isVoiding}>
          <DialogHeader>
            <DialogTitle>Anular pago</DialogTitle>
            <DialogDescription className="pt-1 text-sm">
              {voidingPayment && (
                <>
                  El pago de{' '}
                  <strong className="text-foreground">
                    {formatPeriodLabel(voidingPayment.period)}
                  </strong>{' '}
                  quedará marcado como <strong>Anulado</strong> en el historial
                  (conservando su comprobante original intacto para auditoría) y
                  el periodo volverá a quedar pendiente para que puedas
                  registrar el comprobante correcto.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleConfirmVoidPayment}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="void-service-payment-reason">
                Motivo de anulación (obligatorio)
              </Label>
              <textarea
                id="void-service-payment-reason"
                rows={3}
                minLength={3}
                maxLength={200}
                required
                disabled={isVoiding}
                placeholder="Ej. Se adjuntó el recibo del mes equivocado..."
                value={voidReason}
                onChange={(event) => {
                  setVoidReason(event.target.value)
                  if (voidError) {
                    setVoidError(null)
                  }
                }}
                className="w-full min-w-0 resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
              />
              {voidError && <FieldError>{voidError}</FieldError>}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeVoidDialog}
                disabled={isVoiding}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isVoiding || voidReason.trim().length < 3}
              >
                {isVoiding && (
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                )}
                <span>{isVoiding ? 'Anulando...' : 'Confirmar anulación'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
