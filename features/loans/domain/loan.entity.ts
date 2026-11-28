export type LoanDirection = 'LENT'

export type LoanInterestModel =
  | 'OPEN_ENDED'
  | 'NO_INTEREST'
  | 'SINGLE_PAYMENT'
  | 'INTEREST_ONLY_BALLOON'
  | 'DECLINING_BALANCE'

export type LoanStatus = 'ACTIVE' | 'PAID' | 'REFINANCED' | 'ARCHIVED'

export type LoanInstallmentStatus = 'PENDING' | 'PARTIAL' | 'PAID'

export type LoanPaymentStatus = 'APPLIED' | 'VOIDED'

export type LoanEffectiveStatus =
  'ACTIVE' | 'OVERDUE' | 'OPEN_ENDED' | 'PAID' | 'REFINANCED' | 'ARCHIVED'

export interface LoanInstallment {
  installmentNumber: number
  dueDate: string // YYYY-MM-DD
  principalDue: number
  interestDue: number
  lateFeeDue: number
  paidAmount: number
  status: LoanInstallmentStatus
}

export interface LoanPayment {
  id: string
  amount: number
  principalApplied: number
  interestApplied: number
  lateFeeApplied: number
  paidAt: Date | string
  receiptPath: string | null
  notes: string | null
  status: LoanPaymentStatus
  voidedAt: string | null
  voidReason: string | null
}

export interface Loan {
  id: string
  userId: string
  contactId: string
  direction: LoanDirection
  principalAmount: number
  interestRate: number
  interestModel: LoanInterestModel
  totalPrincipalDue: number
  totalInterestDue: number
  paidPrincipal: number
  paidInterest: number
  installments: LoanInstallment[]
  payments: LoanPayment[]
  disbursementDate: string // YYYY-MM-DD
  disbursementReceiptPath: string | null
  monthlyBillingDay: number | null
  nextInterestDueDate: string | null // YYYY-MM-DD
  status: LoanStatus
  parentLoanId: string | null
  notes: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

export type LoanDomainErrorCode =
  | 'CONTACT_NOT_FOUND'
  | 'CONTACT_ARCHIVED'
  | 'LOAN_NOT_FOUND'
  | 'LOAN_NOT_ACTIVE'
  | 'INVALID_SCHEDULE'
  | 'INVALID_PAYMENT_AMOUNT'
  | 'PAYMENT_EXCEEDS_BALANCE'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_ALREADY_VOIDED'
  | 'LOAN_CANNOT_VOID_PAYMENT'
  | 'RECEIPT_ALREADY_EXISTS'
  | 'INSTALLMENT_NOT_FOUND'
  | 'INSTALLMENT_ALREADY_PAID'
  | 'OPEN_ENDED_NO_INSTALLMENTS'
  | 'INVALID_REFINANCE_AMOUNT'

export class LoanDomainError extends Error {
  readonly code: LoanDomainErrorCode
  readonly userMessage: string

  constructor(code: LoanDomainErrorCode, message: string, userMessage: string) {
    super(message)
    this.name = 'LoanDomainError'
    this.code = code
    this.userMessage = userMessage
  }
}

export const INTEREST_MODEL_LABELS: Record<LoanInterestModel, string> = {
  OPEN_ENDED: 'Sin plazo fijo / Abonos libres',
  NO_INTEREST: 'Sin interés (cuotas)',
  SINGLE_PAYMENT: 'Pago único al vencimiento',
  INTEREST_ONLY_BALLOON: 'Solo intereses + capital final',
  DECLINING_BALANCE: 'Saldo decreciente',
}

export const INTEREST_MODEL_DESCRIPTIONS: Record<LoanInterestModel, string> = {
  OPEN_ENDED:
    'Sin fecha límite de devolución del capital. Con 0% no genera cuotas ni recordatorios; con interés mensual (> 0%) cobra un interés mensual sobre el capital vigente y activa recordatorios.',
  NO_INTEREST:
    'Capital dividido en cuotas sin interés con fechas personalizables.',
  SINGLE_PAYMENT:
    'Un único pago al vencimiento que cubre el capital más el interés acordado.',
  INTEREST_ONLY_BALLOON:
    'Cuotas periódicas de solo intereses y devolución total del capital en la última cuota.',
  DECLINING_BALANCE:
    'Abono a capital fijo por cuota más interés calculado sobre el saldo pendiente de cada periodo.',
}

/**
 * Rounds a monetary amount safely to 2 decimal places, normalizing `-0` to `0`.
 */
export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * Formats a numeric amount in Colombian Pesos (`es-CO`) for UI display.
 * Omits decimals when the amount is a whole number.
 */
export function formatCurrency(
  amount: number,
  locale: string = 'es-CO'
): string {
  const safeAmount = roundCurrency(amount)
  const hasDecimals = Math.abs(safeAmount % 1) > 0.001

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(safeAmount)
}

export interface LoanTotals {
  totalPrincipalDue: number
  totalInterestDue: number
  totalLateFeeDue: number
  totalDue: number
  paidPrincipal: number
  paidInterest: number
  paidLateFee: number
  totalPaid: number
  remainingPrincipal: number
  remainingInterest: number
  remainingLateFee: number
  remainingTotal: number
  progressPercent: number
}

export interface OpenEndedInterestBreakdown {
  capitalAlive: number
  pendingInterest: number
  collectedInterest: number
}

/**
 * Returns `true` exclusively for open-ended revolving loans that accrue
 * periodic monthly interest (`OPEN_ENDED` with `interestRate > 0`).
 * Zero-interest open-ended loans and all fixed-schedule models return `false`.
 */
export function isOpenEndedWithInterest(
  loan: Pick<Loan, 'interestModel' | 'interestRate'>
): boolean {
  return loan.interestModel === 'OPEN_ENDED' && loan.interestRate > 0
}

/**
 * Computes exact totals, paid breakdown, remaining balances, and completion progress for a loan.
 */
export function getLoanTotals(loan: Loan): LoanTotals {
  const totalPrincipalDue = roundCurrency(loan.totalPrincipalDue)
  const totalInterestDue = roundCurrency(loan.totalInterestDue)
  const totalLateFeeDue = roundCurrency(
    loan.installments.reduce(
      (acc, installment) => acc + Math.max(0, installment.lateFeeDue),
      0
    )
  )

  const paidPrincipal = roundCurrency(loan.paidPrincipal)
  const paidInterest = roundCurrency(loan.paidInterest)
  const paidLateFee = roundCurrency(
    loan.payments
      .filter((payment) => payment.status !== 'VOIDED')
      .reduce((acc, payment) => acc + Math.max(0, payment.lateFeeApplied), 0)
  )

  const totalDue = roundCurrency(
    totalPrincipalDue + totalInterestDue + totalLateFeeDue
  )
  const totalPaid = roundCurrency(paidPrincipal + paidInterest + paidLateFee)

  const remainingPrincipal = roundCurrency(
    Math.max(0, totalPrincipalDue - paidPrincipal)
  )
  const remainingInterest = roundCurrency(
    Math.max(0, totalInterestDue - paidInterest)
  )
  const remainingLateFee = roundCurrency(
    Math.max(0, totalLateFeeDue - paidLateFee)
  )
  const remainingTotal = roundCurrency(
    remainingPrincipal + remainingInterest + remainingLateFee
  )

  const progressPercent =
    totalDue <= 0
      ? 100
      : Math.min(100, Math.max(0, Math.round((totalPaid / totalDue) * 100)))

  return {
    totalPrincipalDue,
    totalInterestDue,
    totalLateFeeDue,
    totalDue,
    paidPrincipal,
    paidInterest,
    paidLateFee,
    totalPaid,
    remainingPrincipal,
    remainingInterest,
    remainingLateFee,
    remainingTotal,
    progressPercent,
  }
}

/**
 * Computes the three direct balance indicators for open-ended loans with interest:
 * - `capitalAlive`: original principal still unpaid.
 * - `pendingInterest`: accrued interest not yet covered (`0` when up to date or settled).
 * - `collectedInterest`: cumulative interest recovered across valid (non-voided) payments.
 */
export function getOpenEndedInterestBreakdown(
  loan: Loan
): OpenEndedInterestBreakdown {
  const totals = getLoanTotals(loan)
  const collectedInterest =
    loan.payments.length > 0
      ? roundCurrency(
          loan.payments
            .filter((payment) => payment.status !== 'VOIDED')
            .reduce(
              (acc, payment) => acc + Math.max(0, payment.interestApplied),
              0
            )
        )
      : roundCurrency(Math.max(0, totals.paidInterest))

  return {
    capitalAlive: totals.remainingPrincipal,
    pendingInterest: totals.remainingInterest,
    collectedInterest,
  }
}

export interface LoanReminderMessageParams {
  contactName: string
  guarantorName?: string | null
  isViaIntermediary: boolean
  interestModel: LoanInterestModel
  interestRate?: number
  remainingPrincipal?: number
  remainingTotal: number
  isOverdue: boolean
  overdueDays: number
  openEndedMonthlyInterestDue?: number | null
  nextInterestDueDate?: string | null
  nextInstallmentDueDate?: string | null
  nextInstallmentRemaining?: number | null
}

/**
 * Builds a polite, prefilled Spanish WhatsApp reminder message tailored to direct
 * or intermediary contacts and to the loan's current status.
 */
export function buildLoanReminderMessage(
  params: LoanReminderMessageParams
): string {
  const greetingName =
    params.isViaIntermediary && params.guarantorName
      ? params.guarantorName
      : params.contactName

  const subjectLine = params.isViaIntermediary
    ? `el préstamo de ${params.contactName}`
    : 'tu préstamo'

  const formattedRemaining = formatCurrency(params.remainingTotal)

  if (params.interestModel === 'OPEN_ENDED') {
    const hasMonthlyInterest =
      (params.interestRate ?? 0) > 0 &&
      (params.openEndedMonthlyInterestDue ?? 0) > 0

    if (hasMonthlyInterest) {
      const formattedInterest = formatCurrency(
        params.openEndedMonthlyInterestDue!
      )
      const formattedCapital = formatCurrency(
        params.remainingPrincipal ?? params.remainingTotal
      )

      if (params.isOverdue) {
        const daysLabel =
          params.overdueDays === 1 ? '1 día' : `${params.overdueDays} días`
        return `Hola ${greetingName}, te recuerdo amablemente que el cobro mensual de intereses de ${subjectLine} por ${formattedInterest} venció hace ${daysLabel} (capital vigente: ${formattedCapital}). ¿Me confirmas cuándo podrías realizar el pago? ¡Gracias!`
      }

      if (params.nextInterestDueDate) {
        return `Hola ${greetingName}, te escribo para recordarte que el próximo cobro mensual de intereses de ${subjectLine} es el ${params.nextInterestDueDate} por ${formattedInterest} (capital vigente: ${formattedCapital}). ¡Muchas gracias!`
      }

      return `Hola ${greetingName}, te recuerdo que el interés mensual vigente de ${subjectLine} es de ${formattedInterest} sobre un capital pendiente de ${formattedCapital}. ¡Muchas gracias!`
    }

    return `Hola ${greetingName}, ¿cómo estás? Te escribo para saludarte y recordarte el saldo pendiente de ${subjectLine}, que actualmente es de ${formattedRemaining}. ¡Gracias!`
  }

  if (params.isOverdue && params.nextInstallmentRemaining) {
    const daysLabel =
      params.overdueDays === 1 ? '1 día' : `${params.overdueDays} días`
    return `Hola ${greetingName}, te recuerdo amablemente que ${subjectLine} tiene una cuota vencida hace ${daysLabel} por ${formatCurrency(params.nextInstallmentRemaining)} (saldo total pendiente: ${formattedRemaining}). ¿Me confirmas cuándo podrías realizar el pago? ¡Gracias!`
  }

  if (params.nextInstallmentDueDate && params.nextInstallmentRemaining) {
    return `Hola ${greetingName}, te escribo para recordarte que la próxima cuota de ${subjectLine} vence el ${params.nextInstallmentDueDate} por ${formatCurrency(params.nextInstallmentRemaining)} (saldo total pendiente: ${formattedRemaining}). ¡Muchas gracias!`
  }

  return `Hola ${greetingName}, te recuerdo que el saldo pendiente de ${subjectLine} es de ${formattedRemaining}. ¡Gracias!`
}

/**
 * Builds a `https://wa.me/...` URL with a prefilled URL-encoded reminder message.
 */
export function buildLoanWhatsAppUrl(
  e164Phone: string,
  message: string
): string {
  const digits = e164Phone.replace(/\D/g, '')
  const trimmedMessage = message.trim()
  if (!trimmedMessage) {
    return `https://wa.me/${digits}`
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(trimmedMessage)}`
}
