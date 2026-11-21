'use client'

import { useState, useTransition } from 'react'
import { BellRingIcon, InfinityIcon } from 'lucide-react'
import { toast } from 'sonner'

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
import type { EnrichedLoan } from '@/features/loans/application/get-loans-board.use-case'
import {
  formatCurrency,
  INTEREST_MODEL_DESCRIPTIONS,
  INTEREST_MODEL_LABELS,
  roundCurrency,
  type LoanInterestModel,
} from '@/features/loans/domain/loan.entity'
import {
  calculateLoanSchedule,
  extractDayFromIsoDate,
  formatReferenceDateToIsoDate,
  isValidIsoDate,
  type CustomInstallmentDraft,
} from '@/features/loans/domain/loan-schedule.calculator'
import { refinanceLoanAction } from '@/features/loans/presentation/actions/loan.actions'
import { LoanScheduleEditor } from '@/features/loans/presentation/components/loan-schedule-editor'

const INTEREST_MODELS: LoanInterestModel[] = [
  'OPEN_ENDED',
  'NO_INTEREST',
  'SINGLE_PAYMENT',
  'INTEREST_ONLY_BALLOON',
  'DECLINING_BALANCE',
]

interface RefinanceLoanSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loan: EnrichedLoan | null
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

export function RefinanceLoanSheet({
  open,
  onOpenChange,
  loan,
}: RefinanceLoanSheetProps) {
  const todayIso = formatReferenceDateToIsoDate(new Date())

  const [principalInput, setPrincipalInput] = useState(
    loan ? String(loan.totals.remainingTotal) : ''
  )
  const [interestModel, setInterestModel] = useState<LoanInterestModel>(
    loan?.interestModel ?? 'DECLINING_BALANCE'
  )
  const [interestRateInput, setInterestRateInput] = useState(
    loan ? String(loan.interestRate) : '5'
  )
  const [disbursementDate, setDisbursementDate] = useState(todayIso)
  const [monthlyBillingDayInput, setMonthlyBillingDayInput] = useState(() =>
    String(loan?.monthlyBillingDay ?? extractDayFromIsoDate(todayIso))
  )
  const [installmentCountInput, setInstallmentCountInput] = useState('3')
  const [notes, setNotes] = useState('')
  const [customInstallments, setCustomInstallments] = useState<
    CustomInstallmentDraft[] | null
  >(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (!loan) {
    return null
  }

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

  function handleRequestConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    if (!Number.isFinite(parsedPrincipal) || parsedPrincipal <= 0) {
      setErrorMessage('El saldo acordado a refinanciar debe ser mayor a 0.')
      return
    }

    if (!isValidIsoDate(disbursementDate)) {
      setErrorMessage('Selecciona una fecha válida para el nuevo acuerdo.')
      return
    }

    if (interestModel !== 'OPEN_ENDED' && effectiveInstallments.length === 0) {
      setErrorMessage('Debes definir al menos una cuota para el nuevo acuerdo.')
      return
    }

    setConfirmOpen(true)
  }

  function handleConfirmRefinance() {
    if (!loan) {
      return
    }

    startTransition(async () => {
      const result = await refinanceLoanAction({
        loanId: loan.id,
        principalAmount: parsedPrincipal,
        interestRate: parsedRate,
        interestModel,
        disbursementDate,
        monthlyBillingDay: isOpenEndedWithInterest ? parsedBillingDay : null,
        installmentCount:
          interestModel === 'OPEN_ENDED'
            ? undefined
            : effectiveInstallments.length,
        installments:
          interestModel === 'OPEN_ENDED' ? undefined : effectiveInstallments,
        notes: notes.trim() || null,
      })

      if (!result.ok) {
        setConfirmOpen(false)
        setErrorMessage(result.error)
        return
      }

      setConfirmOpen(false)
      toast.success(
        `Préstamo de ${loan.contact.name} refinanciado correctamente.`
      )
      onOpenChange(false)
    })
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>Refinanciar — {loan.contact.name}</SheetTitle>
            <SheetDescription>
              El préstamo actual (saldo pendiente:{' '}
              <span className="font-medium text-foreground">
                {formatCurrency(loan.totals.remainingTotal)}
              </span>
              ) se congelará como <strong>Refinanciado</strong> y se creará un
              nuevo préstamo enlazado.
            </SheetDescription>
          </SheetHeader>

          <form
            onSubmit={handleRequestConfirm}
            className="flex flex-1 flex-col px-4"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="refinance-model">
                  Nueva modalidad
                </FieldLabel>
                <Select
                  value={interestModel}
                  onValueChange={(value) => {
                    if (value !== null) {
                      handleModelChange(value as LoanInterestModel)
                    }
                  }}
                >
                  <SelectTrigger id="refinance-model" className="w-full">
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
                  <FieldLabel htmlFor="refinance-principal">
                    Saldo acordado a refinanciar (COP)
                  </FieldLabel>
                  <Input
                    id="refinance-principal"
                    type="number"
                    min="1"
                    step="any"
                    value={principalInput}
                    onChange={(event) => {
                      setPrincipalInput(event.target.value)
                      setCustomInstallments(null)
                    }}
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="refinance-date">
                    Fecha del nuevo acuerdo
                  </FieldLabel>
                  <Input
                    id="refinance-date"
                    type="date"
                    value={disbursementDate}
                    onChange={(event) => {
                      setDisbursementDate(event.target.value)
                      setCustomInstallments(null)
                    }}
                    required
                  />
                </Field>
              </div>

              {(needsInterestRate || needsInstallmentCount) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {needsInterestRate && (
                    <Field>
                      <FieldLabel htmlFor="refinance-rate">
                        {interestModel === 'SINGLE_PAYMENT'
                          ? 'Interés total (%)'
                          : interestModel === 'OPEN_ENDED'
                            ? '% de interés mensual (opcional)'
                            : 'Tasa de interés por periodo (%)'}
                      </FieldLabel>
                      <Input
                        id="refinance-rate"
                        type="number"
                        min="0"
                        max="1000"
                        step="0.1"
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
                      <FieldLabel htmlFor="refinance-billing-day">
                        Día de cobro mensual (1–31)
                      </FieldLabel>
                      <Input
                        id="refinance-billing-day"
                        type="number"
                        min="1"
                        max="31"
                        step="1"
                        value={monthlyBillingDayInput}
                        onChange={(event) =>
                          setMonthlyBillingDayInput(event.target.value)
                        }
                        required
                      />
                    </Field>
                  )}

                  {needsInstallmentCount && (
                    <Field>
                      <FieldLabel htmlFor="refinance-count">
                        Número de cuotas
                      </FieldLabel>
                      <Input
                        id="refinance-count"
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
                    <p>
                      Interés mensual estimado:{' '}
                      <strong>
                        {formatCurrency(estimatedMonthlyInterest)} / mes
                      </strong>{' '}
                      (día {parsedBillingDay} de cada mes). Activará
                      recordatorios mensuales automáticos.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-900 dark:text-sky-200">
                    <InfinityIcon className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
                    <p>
                      El nuevo préstamo quedará sin plazo fijo ni recordatorios
                      y aceptará abonos libres directos al capital.
                    </p>
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
                <FieldLabel htmlFor="refinance-notes">
                  Notas del acuerdo (opcional)
                </FieldLabel>
                <textarea
                  id="refinance-notes"
                  rows={2}
                  maxLength={1000}
                  placeholder="Ej. Se acordó refinanciar el saldo restante en 3 cuotas..."
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
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  Continuar a confirmación
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`¿Confirmar refinanciación de ${loan.contact.name}?`}
        description={`El préstamo actual pasará a estado "Refinanciado" conservando todo su historial de abonos intacto, y se creará un nuevo préstamo activo por ${formatCurrency(parsedPrincipal)} (${INTEREST_MODEL_LABELS[interestModel]}).`}
        confirmLabel={
          isPending ? 'Refinanciando...' : 'Confirmar refinanciación'
        }
        cancelLabel="Volver"
        isLoading={isPending}
        onConfirm={handleConfirmRefinance}
      />
    </>
  )
}
