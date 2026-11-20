'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ReceiptFileInput } from '@/components/receipt-file-input'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { EnrichedLoan } from '@/features/loans/application/get-loans-board.use-case'
import {
  formatCurrency,
  roundCurrency,
} from '@/features/loans/domain/loan.entity'
import { MAX_LOAN_RECEIPT_SIZE_BYTES } from '@/features/loans/domain/loan.policy'
import { formatReferenceDateToIsoDate } from '@/features/loans/domain/loan-schedule.calculator'
import { registerLoanPaymentAction } from '@/features/loans/presentation/actions/loan.actions'
import { ReceiptPreviewModal } from '@/features/services/presentation/components/receipt-preview-modal'
import {
  compressImageInBrowser,
  validateClientUploadFile,
} from '@/lib/utils/image-compression'

interface LoanPaymentSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loan: EnrichedLoan | null
}

export function LoanPaymentSheet({
  open,
  onOpenChange,
  loan,
}: LoanPaymentSheetProps) {
  const nextInstallmentRemaining = loan?.nextInstallment
    ? roundCurrency(
        Math.max(
          0,
          loan.nextInstallment.principalDue +
            loan.nextInstallment.interestDue +
            loan.nextInstallment.lateFeeDue -
            loan.nextInstallment.paidAmount
        )
      )
    : null

  const openEndedCycleInterest =
    loan && loan.interestModel === 'OPEN_ENDED' && loan.interestRate > 0
      ? loan.totals.remainingInterest > 0
        ? loan.totals.remainingInterest
        : loan.currentCycleInterestDue
      : null

  const defaultAmount =
    nextInstallmentRemaining && nextInstallmentRemaining > 0
      ? String(nextInstallmentRemaining)
      : openEndedCycleInterest && openEndedCycleInterest > 0
        ? String(openEndedCycleInterest)
        : loan
          ? String(loan.totals.remainingTotal)
          : ''

  const [amountInput, setAmountInput] = useState(defaultAmount)
  const [paidAt, setPaidAt] = useState(formatReferenceDateToIsoDate(new Date()))
  const [notes, setNotes] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null)
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    return () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl)
      }
    }
  }, [previewObjectUrl])

  if (!loan) {
    return null
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      return
    }

    const validation = validateClientUploadFile(file, {
      allowPdf: true,
      maxSizeBytes: MAX_LOAN_RECEIPT_SIZE_BYTES,
    })
    if (!validation.ok) {
      event.target.value = ''
      toast.error(validation.error)
      return
    }

    setErrorMessage(null)
    setIsProcessingFile(true)

    try {
      const processedFile = await compressImageInBrowser(file)
      if (processedFile.size > MAX_LOAN_RECEIPT_SIZE_BYTES) {
        event.target.value = ''
        toast.error('El archivo supera el tamaño máximo permitido de 5 MB.')
        return
      }

      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl)
      }
      setSelectedFile(processedFile)
      setPreviewObjectUrl(URL.createObjectURL(processedFile))
    } catch (error) {
      event.target.value = ''
      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo procesar el comprobante seleccionado.'
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsProcessingFile(false)
    }
  }

  function handleRemoveFile() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl)
    }
    setSelectedFile(null)
    setPreviewObjectUrl(null)
  }

  function handleSheetOpenChange(nextOpen: boolean) {
    if (!nextOpen && previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl)
      setPreviewObjectUrl(null)
      setPreviewModalOpen(false)
      setConfirmSaveOpen(false)
    }
    onOpenChange(nextOpen)
  }

  function executeRegisterPayment() {
    if (!loan) {
      return
    }

    const amount = Number(amountInput)

    startTransition(async () => {
      const formData = new FormData()
      formData.set('loanId', loan.id)
      formData.set('amount', String(amount))
      formData.set('paidAt', paidAt)
      formData.set('notes', notes.trim())

      if (selectedFile) {
        formData.set('receipt', selectedFile)
      }

      const result = await registerLoanPaymentAction(formData)
      if (!result.ok) {
        setConfirmSaveOpen(false)
        setErrorMessage(result.error)
        return
      }

      setConfirmSaveOpen(false)
      toast.success(`Abono de ${formatCurrency(amount)} registrado.`)
      handleSheetOpenChange(false)
    })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!loan) {
      return
    }
    setErrorMessage(null)

    const amount = Number(amountInput)
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Ingresa un monto de abono mayor a 0.')
      return
    }

    if (selectedFile) {
      setConfirmSaveOpen(true)
      return
    }

    executeRegisterPayment()
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Registrar abono — {loan.contact.name}</SheetTitle>
            <SheetDescription>
              Saldo pendiente total:{' '}
              <span className="font-semibold text-foreground">
                {formatCurrency(loan.totals.remainingTotal)}
              </span>
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-1 flex-col px-4">
            <FieldGroup>
              <div className="rounded-xl border bg-muted/30 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Capital pendiente
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(loan.totals.remainingPrincipal)}
                  </span>
                </div>
                {loan.totals.remainingInterest > 0 && (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Interés pendiente
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(loan.totals.remainingInterest)}
                    </span>
                  </div>
                )}
                {loan.totals.remainingLateFee > 0 && (
                  <div className="mt-1 flex items-center justify-between text-destructive">
                    <span>Mora pendiente</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(loan.totals.remainingLateFee)}
                    </span>
                  </div>
                )}
              </div>

              <Field>
                <FieldLabel htmlFor="payment-amount">
                  Monto recibido (COP)
                </FieldLabel>
                <Input
                  id="payment-amount"
                  type="number"
                  min="1"
                  step="any"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  required
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  {nextInstallmentRemaining !== null &&
                    nextInstallmentRemaining > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          setAmountInput(String(nextInstallmentRemaining))
                        }
                      >
                        Cuota #{loan.nextInstallment?.installmentNumber} (
                        {formatCurrency(nextInstallmentRemaining)})
                      </Button>
                    )}
                  {openEndedCycleInterest !== null &&
                    openEndedCycleInterest > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          setAmountInput(String(openEndedCycleInterest))
                        }
                      >
                        Solo interés del mes (
                        {formatCurrency(openEndedCycleInterest)})
                      </Button>
                    )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setAmountInput(String(loan.totals.remainingTotal))
                    }
                  >
                    Saldar total ({formatCurrency(loan.totals.remainingTotal)})
                  </Button>
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor="payment-date">Fecha del abono</FieldLabel>
                <Input
                  id="payment-date"
                  type="date"
                  value={paidAt}
                  onChange={(event) => setPaidAt(event.target.value)}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="payment-receipt">
                  Comprobante del abono (opcional, imagen o PDF, máx. 5 MB)
                </FieldLabel>
                <ReceiptFileInput
                  id="payment-receipt"
                  file={selectedFile}
                  previewUrl={previewObjectUrl}
                  isProcessing={isProcessingFile}
                  disabled={isPending}
                  placeholderTitle="Adjuntar foto o PDF del abono"
                  onFileChange={handleFileChange}
                  onRemove={handleRemoveFile}
                  onOpenFullPreview={() => setPreviewModalOpen(true)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="payment-notes">
                  Notas (opcional)
                </FieldLabel>
                <textarea
                  id="payment-notes"
                  rows={2}
                  maxLength={500}
                  placeholder="Ej. Pagado por Bancolombia, efectivo..."
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="w-full min-w-0 resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
                />
              </Field>

              {errorMessage && <FieldError>{errorMessage}</FieldError>}
            </FieldGroup>

            <SheetFooter className="px-0 pt-6">
              <div className="flex w-full justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSheetOpenChange(false)}
                  disabled={isPending || isProcessingFile}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending || isProcessingFile}>
                  {isPending ? 'Registrando...' : 'Registrar abono'}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ReceiptPreviewModal
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
        title={`Abono — ${loan.contact.name}`}
        subtitle={
          selectedFile ? `Vista previa local: ${selectedFile.name}` : undefined
        }
        previewUrl={previewObjectUrl}
        fileType={selectedFile?.type}
        fileName={selectedFile?.name}
      />

      <ConfirmDialog
        open={confirmSaveOpen}
        onOpenChange={setConfirmSaveOpen}
        title="Confirmar guardado de comprobante"
        description="¿Estás seguro de guardar este comprobante? Recuerda que una vez registrado no se puede editar ni reemplazar."
        cancelLabel="Revisar archivo"
        confirmLabel={isPending ? 'Guardando...' : 'Sí, guardar comprobante'}
        isLoading={isPending}
        onConfirm={executeRegisterPayment}
      />
    </>
  )
}
