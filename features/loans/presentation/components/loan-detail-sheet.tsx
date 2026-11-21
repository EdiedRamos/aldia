'use client'

import { useState, useTransition } from 'react'
import {
  BanIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  EyeIcon,
  GitBranchIcon,
  InfinityIcon,
  LoaderCircleIcon,
  PencilIcon,
  UploadIcon,
  UserCheckIcon,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { EnrichedLoan } from '@/features/loans/application/get-loans-board.use-case'
import {
  formatCurrency,
  INTEREST_MODEL_LABELS,
  roundCurrency,
  type LoanInstallment,
  type LoanPayment,
} from '@/features/loans/domain/loan.entity'
import {
  formatIsoDateDisplay,
  formatReferenceDateToIsoDate,
} from '@/features/loans/domain/loan-schedule.calculator'
import {
  updateInstallmentAction,
  voidLoanPaymentAction,
} from '@/features/loans/presentation/actions/loan.actions'
import type { LoanReceiptAttachTarget } from '@/features/loans/presentation/components/attach-loan-receipt-dialog'

interface LoanDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loan: EnrichedLoan | null
  onPreviewReceipt: (params: {
    receiptPath: string
    title: string
    subtitle?: string
  }) => void
  onAttachReceipt: (target: LoanReceiptAttachTarget) => void
  onRegisterPayment: (loan: EnrichedLoan) => void
  onRefinance: (loan: EnrichedLoan) => void
}

function formatPaymentDate(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatIsoDateDisplay(value)
  }

  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

export function LoanDetailSheet({
  open,
  onOpenChange,
  loan,
  onPreviewReceipt,
  onAttachReceipt,
  onRegisterPayment,
  onRefinance,
}: LoanDetailSheetProps) {
  const [editingNumber, setEditingNumber] = useState<number | null>(null)
  const [editDueDate, setEditDueDate] = useState('')
  const [editLateFee, setEditLateFee] = useState('0')
  const [isUpdating, startUpdateTransition] = useTransition()

  const [voidingPayment, setVoidingPayment] = useState<LoanPayment | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidError, setVoidError] = useState<string | null>(null)
  const [isVoiding, startVoidTransition] = useTransition()

  if (!loan) {
    return null
  }

  const todayIso = formatReferenceDateToIsoDate(new Date())
  const canVoidPayments = loan.status === 'ACTIVE' || loan.status === 'PAID'

  function openVoidDialog(payment: LoanPayment) {
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
    if (!loan || !voidingPayment) {
      return
    }

    const trimmedReason = voidReason.trim()
    if (trimmedReason.length < 5) {
      setVoidError('El motivo de anulación debe tener al menos 5 caracteres.')
      return
    }

    setVoidError(null)

    startVoidTransition(async () => {
      const result = await voidLoanPaymentAction({
        loanId: loan.id,
        paymentId: voidingPayment.id,
        reason: trimmedReason,
      })

      if (!result.ok) {
        setVoidError(result.error)
        return
      }

      toast.success('Abono anulado y saldo del préstamo restaurado.')
      setVoidingPayment(null)
      setVoidReason('')
      setVoidError(null)
    })
  }

  function startEditingInstallment(inst: LoanInstallment) {
    setEditingNumber(inst.installmentNumber)
    setEditDueDate(inst.dueDate)
    setEditLateFee(String(inst.lateFeeDue))
  }

  function handleSaveInstallment(installmentNumber: number) {
    if (!loan) {
      return
    }
    const parsedLateFee = Number(editLateFee)
    if (!Number.isFinite(parsedLateFee) || parsedLateFee < 0) {
      toast.error('El recargo por mora debe ser un número mayor o igual a 0.')
      return
    }

    startUpdateTransition(async () => {
      const result = await updateInstallmentAction({
        loanId: loan.id,
        installmentNumber,
        dueDate: editDueDate,
        lateFeeDue: parsedLateFee,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(`Cuota #${installmentNumber} actualizada.`)
      setEditingNumber(null)
    })
  }

  const sortedPayments = loan.payments
    .slice()
    .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>Préstamo — {loan.contact.name}</SheetTitle>
            <SheetDescription>
              {INTEREST_MODEL_LABELS[loan.interestModel]} · Desembolsado el{' '}
              {formatIsoDateDisplay(loan.disbursementDate)}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4 pb-6">
            {/* Context badges & disbursement receipt */}
            <div className="flex flex-wrap items-center gap-2">
              {loan.isViaIntermediary && loan.guarantorContact && (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                >
                  <UserCheckIcon className="size-3" />
                  <span>Vía intermediario: {loan.guarantorContact.name}</span>
                </Badge>
              )}
              {loan.parentLoanId && (
                <Badge variant="secondary">
                  <GitBranchIcon className="size-3" />
                  <span>Originado por refinanciación</span>
                </Badge>
              )}
              {loan.interestModel === 'OPEN_ENDED' && (
                <Badge
                  variant="outline"
                  className="border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                >
                  <InfinityIcon className="size-3" />
                  <span>Sin plazo fijo</span>
                </Badge>
              )}
            </div>

            {/* Summary grid */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-3.5 text-xs sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Capital</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  {formatCurrency(loan.totalPrincipalDue)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Intereses</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  {formatCurrency(loan.totalInterestDue)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Recuperado</p>
                <p className="mt-0.5 text-sm font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                  {formatCurrency(loan.totals.totalPaid)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Saldo pendiente</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">
                  {formatCurrency(loan.totals.remainingTotal)}
                </p>
              </div>
            </div>

            {/* Quick actions bar */}
            <div className="flex flex-wrap items-center gap-2">
              {loan.status === 'ACTIVE' && (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      onOpenChange(false)
                      onRegisterPayment(loan)
                    }}
                  >
                    Registrar abono
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false)
                      onRefinance(loan)
                    }}
                  >
                    Refinanciar
                  </Button>
                </>
              )}

              {loan.disbursementReceiptPath ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onPreviewReceipt({
                      receiptPath: loan.disbursementReceiptPath!,
                      title: `Desembolso — ${loan.contact.name}`,
                      subtitle: `Fecha: ${formatIsoDateDisplay(loan.disbursementDate)}`,
                    })
                  }
                >
                  <EyeIcon className="size-3.5" />
                  <span>Ver soporte de desembolso</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onAttachReceipt({
                      kind: 'disbursement',
                      loanId: loan.id,
                      title: `Desembolso — ${loan.contact.name}`,
                      subtitle: `Fecha: ${formatIsoDateDisplay(loan.disbursementDate)}`,
                    })
                  }
                >
                  <UploadIcon className="size-3.5" />
                  <span>Adjuntar soporte de desembolso</span>
                </Button>
              )}
            </div>

            {loan.interestModel === 'OPEN_ENDED' &&
              loan.interestRate > 0 &&
              loan.status === 'ACTIVE' && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      Interés mensual vigente ({loan.interestRate}% sobre
                      capital de{' '}
                      {formatCurrency(loan.totals.remainingPrincipal)})
                    </span>
                    <span className="text-muted-foreground">
                      Día de cobro: {loan.monthlyBillingDay ?? '—'} · Próximo
                      cobro:{' '}
                      {loan.nextInterestDueDate
                        ? formatIsoDateDisplay(loan.nextInterestDueDate)
                        : '—'}
                    </span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCurrency(
                      loan.totals.remainingInterest > 0
                        ? loan.totals.remainingInterest
                        : loan.currentCycleInterestDue
                    )}{' '}
                    / mes
                  </span>
                </div>
              )}

            {loan.notes && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Notas: </span>
                {loan.notes}
              </div>
            )}

            {/* Installments schedule */}
            {loan.interestModel !== 'OPEN_ENDED' && (
              <section className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Cronograma de cuotas ({loan.installments.length})
                  </h3>
                  {loan.status === 'ACTIVE' && (
                    <span className="text-[11px] text-muted-foreground">
                      Puedes reprogramar fecha o agregar mora en cuotas
                      pendientes
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {loan.installments.map((inst) => {
                    const instTotal = roundCurrency(
                      inst.principalDue + inst.interestDue + inst.lateFeeDue
                    )
                    const instRemaining = roundCurrency(
                      Math.max(0, instTotal - inst.paidAmount)
                    )
                    const isInstOverdue =
                      loan.status === 'ACTIVE' &&
                      inst.status !== 'PAID' &&
                      inst.dueDate < todayIso
                    const isEditingThis =
                      editingNumber === inst.installmentNumber

                    return (
                      <div
                        key={inst.installmentNumber}
                        className="rounded-xl border bg-card p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              Cuota #{inst.installmentNumber}
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <CalendarClockIcon className="size-3" />
                              {formatIsoDateDisplay(inst.dueDate)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {inst.status === 'PAID' ? (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              >
                                <CheckCircle2Icon className="size-3" />
                                <span>Pagada</span>
                              </Badge>
                            ) : isInstOverdue ? (
                              <Badge variant="destructive">Vencida</Badge>
                            ) : inst.status === 'PARTIAL' ? (
                              <Badge
                                variant="outline"
                                className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              >
                                Parcial
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pendiente</Badge>
                            )}

                            {loan.status === 'ACTIVE' &&
                              inst.status !== 'PAID' &&
                              !isEditingThis && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Reprogramar cuota ${inst.installmentNumber}`}
                                  onClick={() => startEditingInstallment(inst)}
                                >
                                  <PencilIcon className="size-3" />
                                </Button>
                              )}
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
                          <div>
                            Capital:{' '}
                            <span className="font-medium text-foreground tabular-nums">
                              {formatCurrency(inst.principalDue)}
                            </span>
                          </div>
                          <div>
                            Interés:{' '}
                            <span className="font-medium text-foreground tabular-nums">
                              {formatCurrency(inst.interestDue)}
                            </span>
                          </div>
                          <div>
                            Mora:{' '}
                            <span className="font-medium text-foreground tabular-nums">
                              {formatCurrency(inst.lateFeeDue)}
                            </span>
                          </div>
                          <div className="text-right">
                            {inst.status === 'PAID' ? (
                              <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                                Pagado: {formatCurrency(inst.paidAmount)}
                              </span>
                            ) : (
                              <span className="font-medium text-foreground tabular-nums">
                                Falta: {formatCurrency(instRemaining)}
                              </span>
                            )}
                          </div>
                        </div>

                        {isEditingThis && (
                          <div className="mt-3 flex flex-col gap-2.5 rounded-lg border bg-muted/30 p-2.5">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div className="flex flex-col gap-1">
                                <Label
                                  htmlFor={`edit-due-${inst.installmentNumber}`}
                                  className="text-[11px]"
                                >
                                  Nueva fecha de vencimiento
                                </Label>
                                <Input
                                  id={`edit-due-${inst.installmentNumber}`}
                                  type="date"
                                  value={editDueDate}
                                  onChange={(event) =>
                                    setEditDueDate(event.target.value)
                                  }
                                  className="h-8 text-xs"
                                  disabled={isUpdating}
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <Label
                                  htmlFor={`edit-late-${inst.installmentNumber}`}
                                  className="text-[11px]"
                                >
                                  Recargo por mora (COP)
                                </Label>
                                <Input
                                  id={`edit-late-${inst.installmentNumber}`}
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={editLateFee}
                                  onChange={(event) =>
                                    setEditLateFee(event.target.value)
                                  }
                                  className="h-8 text-xs tabular-nums"
                                  disabled={isUpdating}
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setEditingNumber(null)}
                                disabled={isUpdating}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() =>
                                  handleSaveInstallment(inst.installmentNumber)
                                }
                                disabled={isUpdating}
                              >
                                {isUpdating ? 'Guardando...' : 'Guardar cuota'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Payments history */}
            <section className="flex flex-col gap-2.5">
              <h3 className="text-sm font-semibold">
                Historial de abonos ({sortedPayments.length})
              </h3>

              {sortedPayments.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Aún no se han registrado abonos para este préstamo.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {sortedPayments.map((payment) => {
                    const isVoided = payment.status === 'VOIDED'

                    return (
                      <div
                        key={payment.id}
                        className={`flex flex-col gap-1.5 rounded-xl border p-3 text-xs ${
                          isVoided
                            ? 'border-dashed bg-muted/30 opacity-80'
                            : 'bg-card'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-semibold tabular-nums ${
                                isVoided
                                  ? 'text-muted-foreground line-through'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {formatCurrency(payment.amount)}
                            </span>
                            <span className="text-muted-foreground">
                              {formatPaymentDate(payment.paidAt)}
                            </span>
                            {isVoided && (
                              <Badge
                                variant="outline"
                                className="border-destructive/40 bg-destructive/10 text-destructive"
                              >
                                Anulado
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {payment.receiptPath ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() =>
                                  onPreviewReceipt({
                                    receiptPath: payment.receiptPath!,
                                    title: `Comprobante de abono — ${loan.contact.name}`,
                                    subtitle: `${formatCurrency(payment.amount)} · ${formatPaymentDate(payment.paidAt)}`,
                                  })
                                }
                              >
                                <EyeIcon className="size-3" />
                                <span>Ver comprobante</span>
                              </Button>
                            ) : (
                              !isVoided && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() =>
                                    onAttachReceipt({
                                      kind: 'payment',
                                      loanId: loan.id,
                                      paymentId: payment.id,
                                      title: `Comprobante de abono — ${loan.contact.name}`,
                                      subtitle: `${formatCurrency(payment.amount)} · ${formatPaymentDate(payment.paidAt)}`,
                                    })
                                  }
                                >
                                  <UploadIcon className="size-3" />
                                  <span>Adjuntar comprobante</span>
                                </Button>
                              )
                            )}

                            {!isVoided && canVoidPayments && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                onClick={() => openVoidDialog(payment)}
                              >
                                <BanIcon className="size-3" />
                                <span>Anular abono</span>
                              </Button>
                            )}
                          </div>
                        </div>

                        <div
                          className={`flex flex-wrap gap-3 text-[11px] text-muted-foreground ${
                            isVoided ? 'line-through' : ''
                          }`}
                        >
                          <span>
                            Capital: {formatCurrency(payment.principalApplied)}
                          </span>
                          {payment.interestApplied > 0 && (
                            <span>
                              Interés: {formatCurrency(payment.interestApplied)}
                            </span>
                          )}
                          {payment.lateFeeApplied > 0 && (
                            <span>
                              Mora: {formatCurrency(payment.lateFeeApplied)}
                            </span>
                          )}
                        </div>

                        {payment.notes && (
                          <p className="text-[11px] text-muted-foreground">
                            {payment.notes}
                          </p>
                        )}

                        {isVoided && payment.voidReason && (
                          <div className="mt-1 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">
                              Motivo de anulación:{' '}
                            </span>
                            <span>{payment.voidReason}</span>
                            {payment.voidedAt && (
                              <span className="ml-1.5 opacity-80">
                                ({formatPaymentDate(payment.voidedAt)})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>

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
            <DialogTitle>Anular abono</DialogTitle>
            <DialogDescription className="pt-1 text-sm">
              {voidingPayment && (
                <>
                  El abono de{' '}
                  <strong className="text-foreground">
                    {formatCurrency(voidingPayment.amount)}
                  </strong>{' '}
                  quedará marcado como <strong>Anulado</strong> en el historial
                  (conservando su comprobante original intacto) y se restaurará
                  el saldo pendiente del préstamo.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleConfirmVoidPayment}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="void-payment-reason">
                Motivo de anulación (obligatorio)
              </Label>
              <textarea
                id="void-payment-reason"
                rows={3}
                minLength={5}
                maxLength={500}
                required
                disabled={isVoiding}
                placeholder="Ej. Se registró el monto equivocado (era 50.000 y se ingresaron 500.000)..."
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
                disabled={isVoiding || voidReason.trim().length < 5}
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
