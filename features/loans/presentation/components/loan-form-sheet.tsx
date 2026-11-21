'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { BellRingIcon, InfinityIcon } from 'lucide-react'
import { toast } from 'sonner'

import { ReceiptFileInput } from '@/components/receipt-file-input'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { EnrichedContact } from '@/features/contacts/application/get-contacts.use-case'
import {
  formatCurrency,
  INTEREST_MODEL_DESCRIPTIONS,
  INTEREST_MODEL_LABELS,
  roundCurrency,
  type LoanInterestModel,
} from '@/features/loans/domain/loan.entity'
import { MAX_LOAN_RECEIPT_SIZE_BYTES } from '@/features/loans/domain/loan.policy'
import {
  calculateLoanSchedule,
  extractDayFromIsoDate,
  formatReferenceDateToIsoDate,
  isValidIsoDate,
  type CustomInstallmentDraft,
} from '@/features/loans/domain/loan-schedule.calculator'
import { createLoanAction } from '@/features/loans/presentation/actions/loan.actions'
import { LoanScheduleEditor } from '@/features/loans/presentation/components/loan-schedule-editor'
import { ReceiptPreviewModal } from '@/features/services/presentation/components/receipt-preview-modal'
import {
  compressImageInBrowser,
  validateClientUploadFile,
} from '@/lib/utils/image-compression'

const INTEREST_MODELS: LoanInterestModel[] = [
  'OPEN_ENDED',
  'NO_INTEREST',
  'SINGLE_PAYMENT',
  'INTEREST_ONLY_BALLOON',
  'DECLINING_BALANCE',
]

interface LoanFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts: EnrichedContact[]
}

function buildAutoDrafts(params: {
  principalAmount: number
  interestRate: number
  interestModel: LoanInterestModel
  disbursementDate: string
  installmentCount: number
}): CustomInstallmentDraft[] {
  if (
    params.interestModel === 'OPEN_ENDED' ||
    !Number.isFinite(params.principalAmount) ||
    params.principalAmount <= 0 ||
    !isValidIsoDate(params.disbursementDate)
  ) {
    return []
  }

  try {
    const schedule = calculateLoanSchedule({
      principalAmount: params.principalAmount,
      interestRate: Math.max(0, params.interestRate || 0),
      interestModel: params.interestModel,
      disbursementDate: params.disbursementDate,
      installmentCount:
        params.interestModel === 'SINGLE_PAYMENT'
          ? 1
          : Math.max(
              1,
              Math.min(120, Math.floor(params.installmentCount) || 1)
            ),
    })

    return schedule.installments.map((inst) => ({
      installmentNumber: inst.installmentNumber,
      dueDate: inst.dueDate,
      principalDue: inst.principalDue,
      interestDue: inst.interestDue,
      lateFeeDue: 0,
    }))
  } catch {
    return []
  }
}

export function LoanFormSheet({
  open,
  onOpenChange,
  contacts,
}: LoanFormSheetProps) {
  const activeContacts = contacts.filter((c) => c.status === 'ACTIVE')
  const todayIso = formatReferenceDateToIsoDate(new Date())

  const [contactId, setContactId] = useState(activeContacts[0]?.id ?? '')
  const [interestModel, setInterestModel] =
    useState<LoanInterestModel>('NO_INTEREST')
  const [principalInput, setPrincipalInput] = useState('')
  const [interestRateInput, setInterestRateInput] = useState('5')
  const [disbursementDate, setDisbursementDate] = useState(todayIso)
  const [monthlyBillingDayInput, setMonthlyBillingDayInput] = useState(() =>
    String(extractDayFromIsoDate(todayIso))
  )
  const [isBillingDayCustomized, setIsBillingDayCustomized] = useState(false)
  const [installmentCountInput, setInstallmentCountInput] = useState('3')
  const [notes, setNotes] = useState('')

  const [customInstallments, setCustomInstallments] = useState<
    CustomInstallmentDraft[] | null
  >(null)

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

  const parsedPrincipal = Number(principalInput)
  const parsedRate =
    interestModel === 'NO_INTEREST'
      ? 0
      : Math.max(0, Number(interestRateInput) || 0)
  const parsedBillingDay = Math.min(
    31,
    Math.max(1, Math.floor(Number(monthlyBillingDayInput)) || 1)
  )
  const parsedCount =
    interestModel === 'SINGLE_PAYMENT'
      ? 1
      : Math.max(1, Math.min(120, Number(installmentCountInput) || 1))

  const computedInstallments = buildAutoDrafts({
    principalAmount: parsedPrincipal,
    interestRate: parsedRate,
    interestModel,
    disbursementDate,
    installmentCount: parsedCount,
  })

  const effectiveInstallments = customInstallments ?? computedInstallments
  const selectedContact = activeContacts.find((c) => c.id === contactId) ?? null

  const needsInterestRate =
    interestModel === 'OPEN_ENDED' ||
    interestModel === 'SINGLE_PAYMENT' ||
    interestModel === 'INTEREST_ONLY_BALLOON' ||
    interestModel === 'DECLINING_BALANCE'

  const needsInstallmentCount =
    interestModel === 'NO_INTEREST' ||
    interestModel === 'INTEREST_ONLY_BALLOON' ||
    interestModel === 'DECLINING_BALANCE'

  const isOpenEndedWithInterest =
    interestModel === 'OPEN_ENDED' && parsedRate > 0

  const estimatedMonthlyInterest =
    isOpenEndedWithInterest &&
    Number.isFinite(parsedPrincipal) &&
    parsedPrincipal > 0
      ? roundCurrency(parsedPrincipal * (parsedRate / 100))
      : 0

  function handleModelChange(nextModel: LoanInterestModel) {
    setInterestModel(nextModel)
    setCustomInstallments(null)
    if (nextModel === 'OPEN_ENDED' || nextModel === 'NO_INTEREST') {
      setInterestRateInput('0')
    } else if (!interestRateInput || Number(interestRateInput) === 0) {
      setInterestRateInput('5')
    }
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

  function executeCreateLoan() {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('contactId', contactId)
      formData.set('principalAmount', String(parsedPrincipal))
      formData.set('interestRate', String(parsedRate))
      formData.set('interestModel', interestModel)
      formData.set('disbursementDate', disbursementDate)
      formData.set('notes', notes.trim())

      if (interestModel !== 'OPEN_ENDED') {
        formData.set('installmentCount', String(effectiveInstallments.length))
        formData.set('installmentsJson', JSON.stringify(effectiveInstallments))
      } else if (parsedRate > 0) {
        formData.set('monthlyBillingDay', String(parsedBillingDay))
      }

      if (selectedFile) {
        formData.set('receipt', selectedFile)
      }

      const result = await createLoanAction(formData)
      if (!result.ok) {
        setConfirmSaveOpen(false)
        setErrorMessage(result.error)
        return
      }

      setConfirmSaveOpen(false)
      toast.success('Préstamo registrado correctamente.')
      handleSheetOpenChange(false)
    })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    if (!contactId) {
      setErrorMessage('Debes seleccionar un contacto.')
      return
    }

    if (!Number.isFinite(parsedPrincipal) || parsedPrincipal <= 0) {
      setErrorMessage('Ingresa un monto de préstamo mayor a 0.')
      return
    }

    if (!isValidIsoDate(disbursementDate)) {
      setErrorMessage('Selecciona una fecha de desembolso válida.')
      return
    }

    if (interestModel !== 'OPEN_ENDED' && effectiveInstallments.length === 0) {
      setErrorMessage('Debes tener al menos una cuota en el cronograma.')
      return
    }

    if (selectedFile) {
      setConfirmSaveOpen(true)
      return
    }

    executeCreateLoan()
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>Nuevo préstamo</SheetTitle>
            <SheetDescription>
              Registra dinero prestado, elige la modalidad de pago y personaliza
              las fechas de las cuotas si aplica.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-1 flex-col px-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="loan-contact">Contacto</FieldLabel>
                {activeContacts.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    No tienes contactos activos registrados.{' '}
                    <Link
                      href="/contactos"
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      Crea un contacto primero
                    </Link>
                    .
                  </div>
                ) : (
                  <Select
                    value={contactId}
                    onValueChange={(value) => {
                      if (value !== null) {
                        setContactId(value)
                      }
                    }}
                  >
                    <SelectTrigger id="loan-contact" className="w-full">
                      <SelectValue placeholder="Selecciona un contacto">
                        {selectedContact
                          ? `${selectedContact.name}${!selectedContact.phone && selectedContact.guarantor ? ` (vía ${selectedContact.guarantor.name})` : ''}`
                          : 'Selecciona un contacto'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {activeContacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          <span>{contact.name}</span>
                          {!contact.phone && contact.guarantor && (
                            <span className="text-xs text-muted-foreground">
                              (vía {contact.guarantor.name})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="loan-model">
                  Modalidad del préstamo
                </FieldLabel>
                <Select
                  value={interestModel}
                  onValueChange={(value) => {
                    if (value !== null) {
                      handleModelChange(value as LoanInterestModel)
                    }
                  }}
                >
                  <SelectTrigger id="loan-model" className="w-full">
                    <SelectValue>
                      {INTEREST_MODEL_LABELS[interestModel]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {INTEREST_MODELS.map((model) => (
                      <SelectItem key={model} value={model}>
                        {INTEREST_MODEL_LABELS[model]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {INTEREST_MODEL_DESCRIPTIONS[interestModel]}
                </FieldDescription>
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="loan-principal">
                    Monto prestado (COP)
                  </FieldLabel>
                  <Input
                    id="loan-principal"
                    type="number"
                    min="1"
                    step="any"
                    placeholder="Ej. 500000"
                    value={principalInput}
                    onChange={(event) => {
                      setPrincipalInput(event.target.value)
                      setCustomInstallments(null)
                    }}
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="loan-disbursement-date">
                    Fecha de desembolso
                  </FieldLabel>
                  <Input
                    id="loan-disbursement-date"
                    type="date"
                    value={disbursementDate}
                    onChange={(event) => {
                      const nextDate = event.target.value
                      setDisbursementDate(nextDate)
                      setCustomInstallments(null)
                      if (!isBillingDayCustomized && isValidIsoDate(nextDate)) {
                        setMonthlyBillingDayInput(
                          String(extractDayFromIsoDate(nextDate))
                        )
                      }
                    }}
                    required
                  />
                </Field>
              </div>

              {(needsInterestRate || needsInstallmentCount) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {needsInterestRate && (
                    <Field>
                      <FieldLabel htmlFor="loan-interest-rate">
                        {interestModel === 'SINGLE_PAYMENT'
                          ? 'Interés total (%)'
                          : interestModel === 'OPEN_ENDED'
                            ? '% de interés mensual (opcional)'
                            : 'Tasa de interés por periodo (%)'}
                      </FieldLabel>
                      <Input
                        id="loan-interest-rate"
                        type="number"
                        min="0"
                        max="1000"
                        step="0.1"
                        placeholder={
                          interestModel === 'OPEN_ENDED'
                            ? '0 (sin interés)'
                            : 'Ej. 5'
                        }
                        value={interestRateInput}
                        onChange={(event) => {
                          setInterestRateInput(event.target.value)
                          setCustomInstallments(null)
                        }}
                      />
                    </Field>
                  )}

                  {isOpenEndedWithInterest && (
                    <Field>
                      <FieldLabel htmlFor="loan-monthly-billing-day">
                        Día de cobro mensual (1–31)
                      </FieldLabel>
                      <Input
                        id="loan-monthly-billing-day"
                        type="number"
                        min="1"
                        max="31"
                        step="1"
                        value={monthlyBillingDayInput}
                        onChange={(event) => {
                          setMonthlyBillingDayInput(event.target.value)
                          setIsBillingDayCustomized(true)
                        }}
                        required
                      />
                    </Field>
                  )}

                  {needsInstallmentCount && (
                    <Field>
                      <FieldLabel htmlFor="loan-installment-count">
                        Número de cuotas
                      </FieldLabel>
                      <Input
                        id="loan-installment-count"
                        type="number"
                        min="1"
                        max="120"
                        step="1"
                        value={installmentCountInput}
                        onChange={(event) => {
                          setInstallmentCountInput(event.target.value)
                          setCustomInstallments(null)
                        }}
                      />
                    </Field>
                  )}
                </div>
              )}

              {interestModel === 'OPEN_ENDED' ? (
                isOpenEndedWithInterest ? (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-200">
                    <BellRingIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="font-medium">
                        Interés mensual estimado:{' '}
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(estimatedMonthlyInterest)} / mes sobre
                          capital vigente
                        </span>
                      </p>
                      <p className="mt-0.5 opacity-90">
                        Este préstamo{' '}
                        <strong>
                          sí activará recordatorios mensuales en el Bot de
                          WhatsApp
                        </strong>{' '}
                        (el día {parsedBillingDay} de cada mes, hacia{' '}
                        {selectedContact &&
                        !selectedContact.phone &&
                        selectedContact.guarantor
                          ? `su intermediario ${selectedContact.guarantor.name}`
                          : 'el contacto titular'}
                        ). Los abonos que superen el interés del mes reducen el
                        capital y recalculan el siguiente cobro automáticamente.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-900 dark:text-sky-200">
                    <InfinityIcon className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
                    <div>
                      <p className="font-medium">
                        Modo abierto sin interés (&ldquo;Págame cuando
                        puedas&rdquo;)
                      </p>
                      <p className="mt-0.5 opacity-90">
                        Con 0% de interés no genera cuotas ni recordatorios
                        automáticos. Cada abono se descuenta directamente del
                        capital hasta saldar el total.
                      </p>
                    </div>
                  </div>
                )
              ) : (
                effectiveInstallments.length > 0 && (
                  <LoanScheduleEditor
                    interestModel={interestModel}
                    installments={effectiveInstallments}
                    isCustomized={customInstallments !== null}
                    onChange={(next) => setCustomInstallments(next)}
                    onReset={() => setCustomInstallments(null)}
                    disabled={isPending}
                  />
                )
              )}

              <Field>
                <FieldLabel htmlFor="loan-disbursement-receipt">
                  Comprobante de desembolso (opcional, imagen o PDF, máx. 5 MB)
                </FieldLabel>
                <ReceiptFileInput
                  id="loan-disbursement-receipt"
                  file={selectedFile}
                  previewUrl={previewObjectUrl}
                  isProcessing={isProcessingFile}
                  disabled={isPending}
                  placeholderTitle="Adjuntar captura de transferencia o soporte"
                  onFileChange={handleFileChange}
                  onRemove={handleRemoveFile}
                  onOpenFullPreview={() => setPreviewModalOpen(true)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="loan-notes">Notas (opcional)</FieldLabel>
                <textarea
                  id="loan-notes"
                  rows={2}
                  maxLength={1000}
                  placeholder="Ej. Transferencia por Nequi, acuerdo de pago quincenal..."
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
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isPending || isProcessingFile || activeContacts.length === 0
                  }
                >
                  {isPending ? 'Guardando...' : 'Crear préstamo'}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ReceiptPreviewModal
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
        title="Comprobante de desembolso"
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
        onConfirm={executeCreateLoan}
      />
    </>
  )
}
