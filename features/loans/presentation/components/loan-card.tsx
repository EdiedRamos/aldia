'use client'

import { useState, useTransition } from 'react'
import {
  AlertTriangleIcon,
  ArchiveIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  EyeIcon,
  GitBranchIcon,
  HandCoinsIcon,
  InfinityIcon,
  ListChecksIcon,
  MessageCircleIcon,
  MoreVerticalIcon,
  RefreshCwIcon,
  UploadIcon,
  UserCheckIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getContactInitials } from '@/features/contacts/domain/contact.entity'
import type { EnrichedLoan } from '@/features/loans/application/get-loans-board.use-case'
import {
  formatCurrency,
  INTEREST_MODEL_LABELS,
  roundCurrency,
} from '@/features/loans/domain/loan.entity'
import { formatIsoDateDisplay } from '@/features/loans/domain/loan-schedule.calculator'
import {
  buildTemplatedLoanWhatsAppUrl,
  type WhatsAppMessageTemplates,
} from '@/features/loans/domain/loan-whatsapp-template'
import { archiveLoanAction } from '@/features/loans/presentation/actions/loan.actions'
import type { LoanReceiptAttachTarget } from '@/features/loans/presentation/components/attach-loan-receipt-dialog'

interface LoanCardProps {
  loan: EnrichedLoan
  whatsAppTemplates: WhatsAppMessageTemplates
  onRegisterPayment: (loan: EnrichedLoan) => void
  onViewDetail: (loan: EnrichedLoan) => void
  onRefinance: (loan: EnrichedLoan) => void
  onPreviewReceipt: (params: {
    receiptPath: string
    title: string
    subtitle?: string
  }) => void
  onAttachReceipt: (target: LoanReceiptAttachTarget) => void
}

export function LoanCard({
  loan,
  whatsAppTemplates,
  onRegisterPayment,
  onViewDetail,
  onRefinance,
  onPreviewReceipt,
  onAttachReceipt,
}: LoanCardProps) {
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false)
  const [isArchiving, startArchiveTransition] = useTransition()

  const appliedPaymentsCount = loan.payments.filter(
    (payment) => payment.status !== 'VOIDED'
  ).length

  const nextInstallmentRemaining = loan.nextInstallment
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

  const isOpenEndedWithInterest =
    loan.interestModel === 'OPEN_ENDED' && loan.interestRate > 0

  const openEndedMonthlyInterestDue = isOpenEndedWithInterest
    ? loan.totals.remainingInterest > 0
      ? loan.totals.remainingInterest
      : loan.currentCycleInterestDue
    : null

  const dueAmountForTemplate = isOpenEndedWithInterest
    ? (openEndedMonthlyInterestDue ?? loan.totals.remainingTotal)
    : loan.nextInstallment
      ? (nextInstallmentRemaining ?? loan.totals.remainingTotal)
      : loan.totals.remainingTotal

  const dueDateForTemplate =
    isOpenEndedWithInterest && loan.nextInterestDueDate
      ? formatIsoDateDisplay(loan.nextInterestDueDate)
      : loan.nextInstallment
        ? formatIsoDateDisplay(loan.nextInstallment.dueDate)
        : 'la fecha acordada'

  const remainingBalanceForTemplate =
    loan.totals.remainingPrincipal > 0
      ? loan.totals.remainingPrincipal
      : loan.totals.remainingTotal

  const whatsappUrl = loan.effectivePhone
    ? buildTemplatedLoanWhatsAppUrl({
        phone: loan.effectivePhone,
        templates: whatsAppTemplates,
        isViaIntermediary: loan.isViaIntermediary,
        contactName: loan.contact.name,
        guarantorName: loan.guarantorContact?.name ?? null,
        amountFormatted: formatCurrency(dueAmountForTemplate),
        dueDateFormatted: dueDateForTemplate,
        remainingPrincipalFormatted: formatCurrency(
          remainingBalanceForTemplate
        ),
      })
    : null

  function handleConfirmArchive() {
    startArchiveTransition(async () => {
      const result = await archiveLoanAction(loan.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setConfirmArchiveOpen(false)
      toast.success(`Préstamo de ${loan.contact.name} archivado.`)
    })
  }

  function renderStatusBadge() {
    switch (loan.effectiveStatus) {
      case 'OVERDUE':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangleIcon className="size-3" />
            <span>
              Vencido · {loan.overdueDays}{' '}
              {loan.overdueDays === 1 ? 'día' : 'días'}
            </span>
          </Badge>
        )
      case 'OPEN_ENDED':
        return (
          <Badge
            variant="outline"
            className="gap-1 border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300"
          >
            <InfinityIcon className="size-3" />
            <span>Sin plazo fijo</span>
          </Badge>
        )
      case 'ACTIVE':
        return (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          >
            <CheckCircle2Icon className="size-3" />
            <span>Al día</span>
          </Badge>
        )
      case 'PAID':
        return (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          >
            <CheckCircle2Icon className="size-3" />
            <span>Pagado</span>
          </Badge>
        )
      case 'REFINANCED':
        return (
          <Badge variant="secondary" className="gap-1">
            <RefreshCwIcon className="size-3" />
            <span>Refinanciado</span>
          </Badge>
        )
      case 'ARCHIVED':
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Archivado
          </Badge>
        )
    }
  }

  return (
    <>
      <Card className="flex flex-col justify-between">
        <div>
          <CardHeader>
            <div className="flex items-center gap-3 overflow-hidden">
              <Avatar className="size-10 shrink-0">
                <AvatarFallback className="text-xs font-medium">
                  {getContactInitials(loan.contact.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-base">
                  {loan.contact.name}
                </CardTitle>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {INTEREST_MODEL_LABELS[loan.interestModel]}
                </p>
              </div>
            </div>

            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Opciones del préstamo"
                    />
                  }
                >
                  <MoreVerticalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => onViewDetail(loan)}>
                    <ListChecksIcon />
                    Ver detalle y cuotas
                  </DropdownMenuItem>
                  {loan.disbursementReceiptPath ? (
                    <DropdownMenuItem
                      onClick={() =>
                        onPreviewReceipt({
                          receiptPath: loan.disbursementReceiptPath!,
                          title: `Desembolso — ${loan.contact.name}`,
                          subtitle: `Desembolsado el ${formatIsoDateDisplay(loan.disbursementDate)}`,
                        })
                      }
                    >
                      <EyeIcon />
                      Comprobante de desembolso
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() =>
                        onAttachReceipt({
                          kind: 'disbursement',
                          loanId: loan.id,
                          title: `Desembolso — ${loan.contact.name}`,
                          subtitle: `Desembolsado el ${formatIsoDateDisplay(loan.disbursementDate)}`,
                        })
                      }
                    >
                      <UploadIcon />
                      Adjuntar soporte de desembolso
                    </DropdownMenuItem>
                  )}
                  {loan.status === 'ACTIVE' && (
                    <>
                      <DropdownMenuItem onClick={() => onRegisterPayment(loan)}>
                        <HandCoinsIcon />
                        Registrar abono
                      </DropdownMenuItem>
                      {loan.interestModel !== 'OPEN_ENDED' && (
                        <DropdownMenuItem onClick={() => onViewDetail(loan)}>
                          <CalendarClockIcon />
                          Reprogramar cuota / mora
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onRefinance(loan)}>
                        <RefreshCwIcon />
                        Refinanciar
                      </DropdownMenuItem>
                    </>
                  )}
                  {loan.status !== 'ARCHIVED' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setConfirmArchiveOpen(true)}
                        disabled={isArchiving}
                      >
                        <ArchiveIcon />
                        Archivar préstamo
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 pt-2">
            {/* Status & intermediary badges */}
            <div className="flex flex-wrap gap-1.5">
              {renderStatusBadge()}

              {loan.isViaIntermediary && loan.guarantorContact && (
                <Badge
                  variant="outline"
                  className="max-w-full border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                >
                  <UserCheckIcon className="size-3 shrink-0" />
                  <span className="truncate">
                    Vía intermediario: {loan.guarantorContact.name}
                  </span>
                </Badge>
              )}

              {loan.parentLoanId && (
                <Badge variant="outline" className="text-muted-foreground">
                  <GitBranchIcon className="size-3 shrink-0" />
                  <span>Refinanciación</span>
                </Badge>
              )}
            </div>

            {/* Balances & progress bar */}
            <div className="flex flex-col gap-1.5 rounded-xl border bg-muted/20 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Saldo pendiente
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatCurrency(loan.totals.remainingTotal)}
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    loan.effectiveStatus === 'OVERDUE'
                      ? 'bg-destructive'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${loan.totals.progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>
                  Recuperado: {formatCurrency(loan.totals.totalPaid)} (
                  {loan.totals.progressPercent}%)
                </span>
                <span>Total: {formatCurrency(loan.totals.totalDue)}</span>
              </div>
            </div>

            {/* Next installment or Open-ended strip */}
            {loan.status === 'ACTIVE' &&
              (loan.interestModel === 'OPEN_ENDED' ? (
                isOpenEndedWithInterest ? (
                  <div
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                      loan.isOverdue
                        ? 'border-destructive/30 bg-destructive/5'
                        : 'border-amber-500/25 bg-amber-500/5'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-[11px] text-muted-foreground">
                        {loan.isOverdue
                          ? `Interés mensual (${loan.interestRate}%) vencido`
                          : `Próximo interés (${loan.interestRate}% / mes)`}
                      </span>
                      <span className="font-medium">
                        {loan.nextInterestDueDate
                          ? formatIsoDateDisplay(loan.nextInterestDueDate)
                          : 'Sin fecha'}
                      </span>
                    </div>
                    <span
                      className={`font-semibold tabular-nums ${
                        loan.isOverdue ? 'text-destructive' : ''
                      }`}
                    >
                      {formatCurrency(openEndedMonthlyInterestDue ?? 0)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-sky-700 dark:text-sky-300">
                      <InfinityIcon className="size-3.5" />
                      Sin plazo fijo · 0% interés
                    </span>
                    <span className="text-muted-foreground">
                      {appliedPaymentsCount}{' '}
                      {appliedPaymentsCount === 1 ? 'abono' : 'abonos'}
                    </span>
                  </div>
                )
              ) : (
                loan.nextInstallment && (
                  <div
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                      loan.isOverdue
                        ? 'border-destructive/30 bg-destructive/5'
                        : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-[11px] text-muted-foreground">
                        {loan.isOverdue
                          ? `Cuota #${loan.nextInstallment.installmentNumber} vencida`
                          : `Próxima cuota #${loan.nextInstallment.installmentNumber}`}
                      </span>
                      <span className="font-medium">
                        {formatIsoDateDisplay(loan.nextInstallment.dueDate)}
                      </span>
                    </div>
                    <span
                      className={`font-semibold tabular-nums ${
                        loan.isOverdue ? 'text-destructive' : ''
                      }`}
                    >
                      {formatCurrency(nextInstallmentRemaining ?? 0)}
                    </span>
                  </div>
                )
              ))}
          </CardContent>
        </div>

        <CardFooter className="mt-4 flex flex-wrap items-center gap-2">
          {loan.status === 'ACTIVE' ? (
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={() => onRegisterPayment(loan)}
            >
              <HandCoinsIcon className="size-3.5" />
              <span>Abonar</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => onViewDetail(loan)}
            >
              <ListChecksIcon className="size-3.5" />
              <span>Ver historial</span>
            </Button>
          )}

          {whatsappUrl && loan.status === 'ACTIVE' && (
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
              nativeButton={false}
              render={
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              title={
                loan.isViaIntermediary
                  ? `Enviar recordatorio por WhatsApp a ${loan.guarantorContact?.name}`
                  : `Enviar recordatorio por WhatsApp a ${loan.contact.name}`
              }
            >
              <MessageCircleIcon className="size-3.5" />
              <span>WhatsApp</span>
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onViewDetail(loan)}
          >
            Detalle
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        title={`¿Archivar préstamo de ${loan.contact.name}?`}
        description="El préstamo dejará de contar en tus saldos activos, pero su cronograma, historial de abonos y comprobantes se conservarán intactos."
        confirmLabel={isArchiving ? 'Archivando...' : 'Archivar préstamo'}
        cancelLabel="Cancelar"
        variant="destructive"
        isLoading={isArchiving}
        onConfirm={handleConfirmArchive}
      />
    </>
  )
}
