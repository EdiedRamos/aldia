import {
  getLoanTotals,
  LoanDomainError,
  roundCurrency,
  type Loan,
  type LoanEffectiveStatus,
  type LoanInstallment,
  type LoanInstallmentStatus,
  type LoanInterestModel,
  type LoanPayment,
  type LoanStatus,
} from '@/features/loans/domain/loan.entity'

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const MS_PER_DAY = 24 * 60 * 60 * 1000
const BALANCE_EPSILON = 0.01

/**
 * Validates that a string is a real calendar date in strict `YYYY-MM-DD` format.
 */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) {
    return false
  }

  const [yearStr, monthStr, dayStr] = value.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/**
 * Converts a `YYYY-MM-DD` string into UTC epoch milliseconds at 00:00:00Z.
 */
export function parseIsoDateToUtcMs(isoDate: string): number {
  if (!isValidIsoDate(isoDate)) {
    throw new LoanDomainError(
      'INVALID_SCHEDULE',
      `Invalid ISO date: ${isoDate}`,
      'Las fechas del cronograma deben tener el formato válido AAAA-MM-DD.'
    )
  }

  const [yearStr, monthStr, dayStr] = isoDate.split('-')
  return Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr))
}

/**
 * Formats a `Date` or `YYYY-MM-DD` string to a `YYYY-MM-DD` string.
 * When passed a `Date`, uses its local calendar components consistently with `core/domain/period.ts`.
 */
export function formatReferenceDateToIsoDate(
  referenceDate: Date | string = new Date()
): string {
  if (typeof referenceDate === 'string') {
    if (isValidIsoDate(referenceDate)) {
      return referenceDate
    }
    const parsed = new Date(referenceDate)
    if (Number.isNaN(parsed.getTime())) {
      throw new LoanDomainError(
        'INVALID_SCHEDULE',
        `Invalid reference date: ${referenceDate}`,
        'Fecha de referencia inválida.'
      )
    }
    return formatReferenceDateToIsoDate(parsed)
  }

  const year = String(referenceDate.getFullYear()).padStart(4, '0')
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0')
  const day = String(referenceDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Returns the whole number of calendar days from `fromIsoDate` to `toIsoDate` (`to - from`).
 */
export function diffCalendarDays(
  fromIsoDate: string,
  toIsoDate: string
): number {
  const fromMs = parseIsoDateToUtcMs(fromIsoDate)
  const toMs = parseIsoDateToUtcMs(toIsoDate)
  return Math.round((toMs - fromMs) / MS_PER_DAY)
}

/**
 * Adds `months` calendar months to a `YYYY-MM-DD` date, clamping the day to the
 * last valid day of the target month (e.g. Jan 31 + 1 month -> Feb 28/29).
 */
export function addMonthsToIsoDate(isoDate: string, months: number): string {
  parseIsoDateToUtcMs(isoDate)
  const [yearStr, monthStr, dayStr] = isoDate.split('-')
  const startYear = Number(yearStr)
  const startMonthIndex = Number(monthStr) - 1
  const startDay = Number(dayStr)

  const totalMonths = startYear * 12 + startMonthIndex + months
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12

  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0)
  ).getUTCDate()
  const clampedDay = Math.min(startDay, lastDayOfTargetMonth)

  return `${String(targetYear).padStart(4, '0')}-${String(targetMonthIndex + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

/**
 * Extracts the day-of-month (1–31) from a valid `YYYY-MM-DD` date string.
 */
export function extractDayFromIsoDate(isoDate: string): number {
  parseIsoDateToUtcMs(isoDate)
  return Number(isoDate.split('-')[2])
}

/**
 * Advances `fromIsoDate` by one calendar month, clamping to `billingDay` (1–31)
 * against the last valid day of the target month so billing days like 31 never drift.
 */
export function computeNextMonthlyBillingDate(
  fromIsoDate: string,
  billingDay: number
): string {
  parseIsoDateToUtcMs(fromIsoDate)
  const [yearStr, monthStr] = fromIsoDate.split('-')
  const startYear = Number(yearStr)
  const startMonthIndex = Number(monthStr) - 1

  const totalMonths = startYear * 12 + startMonthIndex + 1
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12

  const safeBillingDay = Math.min(31, Math.max(1, Math.floor(billingDay)))
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0)
  ).getUTCDate()
  const clampedDay = Math.min(safeBillingDay, lastDayOfTargetMonth)

  return `${String(targetYear).padStart(4, '0')}-${String(targetMonthIndex + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

/**
 * Computes the current cycle's monthly interest due on the remaining principal
 * for an active `OPEN_ENDED` loan with `interestRate > 0`. Returns `0` otherwise.
 */
export function getOpenEndedCurrentInterestDue(loan: Loan): number {
  if (
    loan.interestModel !== 'OPEN_ENDED' ||
    loan.interestRate <= 0 ||
    loan.status !== 'ACTIVE'
  ) {
    return 0
  }

  const remainingPrincipal = roundCurrency(
    Math.max(0, loan.totalPrincipalDue - loan.paidPrincipal)
  )
  return roundCurrency(remainingPrincipal * (loan.interestRate / 100))
}

/**
 * Indicates whether a loan should trigger automated payment reminders:
 * - `false` for non-active loans and for `OPEN_ENDED` loans with `interestRate === 0`.
 * - `true` for active `OPEN_ENDED` loans with `interestRate > 0` and all active scheduled models.
 */
export function requiresLoanReminder(loan: Loan): boolean {
  if (loan.status !== 'ACTIVE') {
    return false
  }

  if (loan.interestModel === 'OPEN_ENDED') {
    return loan.interestRate > 0
  }

  return true
}

/**
 * Formats a `YYYY-MM-DD` date for human-readable Spanish display (e.g. `20 nov 2026`).
 */
export function formatIsoDateDisplay(
  isoDate: string,
  locale: string = 'es-CO'
): string {
  if (!isValidIsoDate(isoDate)) {
    return isoDate
  }
  const [yearStr, monthStr, dayStr] = isoDate.split('-')
  const utcDate = new Date(
    Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr))
  )
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDate)
}

/**
 * Generates `count` monthly due dates starting 1 month after `disbursementDate`.
 */
export function generateDefaultDueDates(
  disbursementDate: string,
  count: number
): string[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new LoanDomainError(
      'INVALID_SCHEDULE',
      `Installment count must be >= 1, received ${count}`,
      'Debes indicar al menos 1 cuota para este modelo de préstamo.'
    )
  }

  const dates: string[] = []
  for (let i = 1; i <= count; i += 1) {
    dates.push(addMonthsToIsoDate(disbursementDate, i))
  }
  return dates
}

export interface CalculateScheduleInput {
  principalAmount: number
  interestRate: number
  interestModel: LoanInterestModel
  disbursementDate: string
  monthlyBillingDay?: number | null
  installmentCount?: number
  dueDates?: string[]
}

export interface CalculatedSchedule {
  interestRate: number
  totalPrincipalDue: number
  totalInterestDue: number
  installments: LoanInstallment[]
  monthlyBillingDay: number | null
  nextInterestDueDate: string | null
}

function resolveScheduleDates(
  disbursementDate: string,
  expectedCount: number,
  providedDates?: string[]
): string[] {
  if (providedDates && providedDates.length > 0) {
    for (const date of providedDates) {
      if (!isValidIsoDate(date)) {
        throw new LoanDomainError(
          'INVALID_SCHEDULE',
          `Invalid manual due date: ${date}`,
          'Todas las fechas de cuotas deben ser fechas válidas (AAAA-MM-DD).'
        )
      }
    }

    if (providedDates.length === expectedCount) {
      return providedDates.slice()
    }

    if (providedDates.length > expectedCount) {
      return providedDates.slice(0, expectedCount)
    }

    const padded = providedDates.slice()
    let cursor = padded[padded.length - 1] ?? disbursementDate
    while (padded.length < expectedCount) {
      cursor = addMonthsToIsoDate(cursor, 1)
      padded.push(cursor)
    }
    return padded
  }

  return generateDefaultDueDates(disbursementDate, expectedCount)
}

/**
 * Pure schedule calculator implementing all 5 loan interest models:
 * - `OPEN_ENDED`: No installments, 0% interest, free payments against principal, never overdue.
 * - `NO_INTEREST`: Principal divided evenly across N installments with manual dates, 0% interest.
 * - `SINGLE_PAYMENT`: Single installment covering principal + interest on a manual due date.
 * - `INTEREST_ONLY_BALLOON`: Interest-only periodic installments + principal & final interest on the last installment.
 * - `DECLINING_BALANCE`: Fixed principal per installment + interest calculated on remaining live balance each period.
 */
export function calculateLoanSchedule(
  input: CalculateScheduleInput
): CalculatedSchedule {
  const principal = roundCurrency(input.principalAmount)
  if (!Number.isFinite(principal) || principal <= 0) {
    throw new LoanDomainError(
      'INVALID_SCHEDULE',
      `Principal amount must be > 0, received ${input.principalAmount}`,
      'El monto del préstamo debe ser mayor a 0.'
    )
  }

  if (!isValidIsoDate(input.disbursementDate)) {
    throw new LoanDomainError(
      'INVALID_SCHEDULE',
      `Invalid disbursementDate: ${input.disbursementDate}`,
      'La fecha de desembolso debe tener un formato válido.'
    )
  }

  const rawRate = Number.isFinite(input.interestRate) ? input.interestRate : 0
  if (rawRate < 0) {
    throw new LoanDomainError(
      'INVALID_SCHEDULE',
      `Interest rate cannot be negative: ${rawRate}`,
      'La tasa de interés no puede ser negativa.'
    )
  }

  if (input.interestModel === 'OPEN_ENDED') {
    if (rawRate > 0) {
      const billingDay =
        input.monthlyBillingDay !== undefined &&
        input.monthlyBillingDay !== null
          ? Math.min(31, Math.max(1, Math.floor(input.monthlyBillingDay)))
          : extractDayFromIsoDate(input.disbursementDate)
      const nextInterestDueDate = computeNextMonthlyBillingDate(
        input.disbursementDate,
        billingDay
      )
      const currentCycleInterest = roundCurrency(principal * (rawRate / 100))

      return {
        interestRate: rawRate,
        totalPrincipalDue: principal,
        totalInterestDue: currentCycleInterest,
        installments: [],
        monthlyBillingDay: billingDay,
        nextInterestDueDate,
      }
    }

    return {
      interestRate: 0,
      totalPrincipalDue: principal,
      totalInterestDue: 0,
      installments: [],
      monthlyBillingDay: null,
      nextInterestDueDate: null,
    }
  }

  if (input.interestModel === 'SINGLE_PAYMENT') {
    const dueDates = resolveScheduleDates(
      input.disbursementDate,
      1,
      input.dueDates
    )
    const interestDue = roundCurrency(principal * (rawRate / 100))

    return {
      interestRate: rawRate,
      totalPrincipalDue: principal,
      totalInterestDue: interestDue,
      installments: [
        {
          installmentNumber: 1,
          dueDate: dueDates[0],
          principalDue: principal,
          interestDue,
          lateFeeDue: 0,
          paidAmount: 0,
          status: 'PENDING',
        },
      ],
      monthlyBillingDay: null,
      nextInterestDueDate: null,
    }
  }

  const count =
    input.installmentCount ??
    (input.dueDates && input.dueDates.length > 0 ? input.dueDates.length : 1)

  if (!Number.isInteger(count) || count < 1) {
    throw new LoanDomainError(
      'INVALID_SCHEDULE',
      `Installment count must be a positive integer, received ${count}`,
      'El número de cuotas debe ser un entero mayor o igual a 1.'
    )
  }

  const dueDates = resolveScheduleDates(
    input.disbursementDate,
    count,
    input.dueDates
  )

  if (input.interestModel === 'NO_INTEREST') {
    const basePrincipal = roundCurrency(principal / count)
    const installments: LoanInstallment[] = []
    let allocatedPrincipal = 0

    for (let i = 0; i < count; i += 1) {
      const isLast = i === count - 1
      const principalDue = isLast
        ? roundCurrency(principal - allocatedPrincipal)
        : basePrincipal
      allocatedPrincipal = roundCurrency(allocatedPrincipal + principalDue)

      installments.push({
        installmentNumber: i + 1,
        dueDate: dueDates[i],
        principalDue,
        interestDue: 0,
        lateFeeDue: 0,
        paidAmount: 0,
        status: 'PENDING',
      })
    }

    return {
      interestRate: 0,
      totalPrincipalDue: principal,
      totalInterestDue: 0,
      installments,
      monthlyBillingDay: null,
      nextInterestDueDate: null,
    }
  }

  if (input.interestModel === 'INTEREST_ONLY_BALLOON') {
    const periodInterest = roundCurrency(principal * (rawRate / 100))
    const installments: LoanInstallment[] = dueDates.map((dueDate, index) => {
      const isLast = index === count - 1
      return {
        installmentNumber: index + 1,
        dueDate,
        principalDue: isLast ? principal : 0,
        interestDue: periodInterest,
        lateFeeDue: 0,
        paidAmount: 0,
        status: 'PENDING',
      }
    })

    const totalInterestDue = roundCurrency(
      installments.reduce((acc, item) => acc + item.interestDue, 0)
    )

    return {
      interestRate: rawRate,
      totalPrincipalDue: principal,
      totalInterestDue,
      installments,
      monthlyBillingDay: null,
      nextInterestDueDate: null,
    }
  }

  // DECLINING_BALANCE: fixed principal per period + interest on remaining live balance
  const basePrincipal = roundCurrency(principal / count)
  const installments: LoanInstallment[] = []
  let allocatedPrincipal = 0
  let remainingBalance = principal

  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1
    const principalDue = isLast
      ? roundCurrency(principal - allocatedPrincipal)
      : basePrincipal
    const interestDue = roundCurrency(remainingBalance * (rawRate / 100))

    allocatedPrincipal = roundCurrency(allocatedPrincipal + principalDue)
    remainingBalance = roundCurrency(
      Math.max(0, remainingBalance - principalDue)
    )

    installments.push({
      installmentNumber: i + 1,
      dueDate: dueDates[i],
      principalDue,
      interestDue,
      lateFeeDue: 0,
      paidAmount: 0,
      status: 'PENDING',
    })
  }

  const totalInterestDue = roundCurrency(
    installments.reduce((acc, item) => acc + item.interestDue, 0)
  )

  return {
    interestRate: rawRate,
    totalPrincipalDue: principal,
    totalInterestDue,
    installments,
    monthlyBillingDay: null,
    nextInterestDueDate: null,
  }
}

export interface CustomInstallmentDraft {
  installmentNumber?: number
  dueDate: string
  principalDue: number
  interestDue: number
  lateFeeDue?: number
}

/**
 * Validates and normalizes manually edited installments before persisting a loan,
 * recalculating `totalPrincipalDue` and `totalInterestDue`.
 */
export function buildScheduleFromCustomInstallments(
  interestModel: LoanInterestModel,
  interestRate: number,
  drafts: CustomInstallmentDraft[]
): CalculatedSchedule {
  if (interestModel === 'OPEN_ENDED') {
    throw new LoanDomainError(
      'INVALID_SCHEDULE',
      'OPEN_ENDED loans cannot define custom installments',
      'Un préstamo sin plazo fijo no tiene cuotas programadas.'
    )
  }

  if (drafts.length === 0) {
    throw new LoanDomainError(
      'INVALID_SCHEDULE',
      'Custom schedule must contain at least one installment',
      'Debes definir al menos una cuota en el cronograma.'
    )
  }

  const normalized: LoanInstallment[] = drafts.map((draft, index) => {
    if (!isValidIsoDate(draft.dueDate)) {
      throw new LoanDomainError(
        'INVALID_SCHEDULE',
        `Invalid due date at installment ${index + 1}: ${draft.dueDate}`,
        `La fecha de la cuota #${index + 1} no es válida.`
      )
    }

    const principalDue = roundCurrency(draft.principalDue)
    const interestDue =
      interestModel === 'NO_INTEREST' ? 0 : roundCurrency(draft.interestDue)
    const lateFeeDue = roundCurrency(draft.lateFeeDue ?? 0)

    if (principalDue < 0 || interestDue < 0 || lateFeeDue < 0) {
      throw new LoanDomainError(
        'INVALID_SCHEDULE',
        `Negative amount in installment ${index + 1}`,
        `Los montos de la cuota #${index + 1} no pueden ser negativos.`
      )
    }

    if (principalDue + interestDue + lateFeeDue <= 0) {
      throw new LoanDomainError(
        'INVALID_SCHEDULE',
        `Installment ${index + 1} has zero total due`,
        `La cuota #${index + 1} debe tener un monto mayor a 0.`
      )
    }

    return {
      installmentNumber: index + 1,
      dueDate: draft.dueDate,
      principalDue,
      interestDue,
      lateFeeDue,
      paidAmount: 0,
      status: 'PENDING',
    }
  })

  const totalPrincipalDue = roundCurrency(
    normalized.reduce((acc, item) => acc + item.principalDue, 0)
  )
  const totalInterestDue = roundCurrency(
    normalized.reduce((acc, item) => acc + item.interestDue, 0)
  )

  if (totalPrincipalDue <= 0) {
    throw new LoanDomainError(
      'INVALID_SCHEDULE',
      'Total principal across custom installments must be > 0',
      'La suma del capital en las cuotas debe ser mayor a 0.'
    )
  }

  return {
    interestRate: interestModel === 'NO_INTEREST' ? 0 : interestRate,
    totalPrincipalDue,
    totalInterestDue,
    installments: normalized,
    monthlyBillingDay: null,
    nextInterestDueDate: null,
  }
}

export interface EvaluatedLoanStatus {
  effectiveStatus: LoanEffectiveStatus
  isOverdue: boolean
  overdueDays: number
  overdueInstallmentsCount: number
  nextInstallment: LoanInstallment | null
}

/**
 * Evaluates a loan's real-time effective status against `referenceDate`.
 * - `OPEN_ENDED` loans are NEVER marked as `OVERDUE`.
 * - Scheduled `ACTIVE` loans become `OVERDUE` when any unpaid/partial installment has `dueDate < today`,
 *   reporting the maximum days overdue from the earliest unpaid overdue installment.
 */
export function evaluateLoanEffectiveStatus(
  loan: Loan,
  referenceDate: Date | string = new Date()
): EvaluatedLoanStatus {
  if (loan.status === 'PAID') {
    return {
      effectiveStatus: 'PAID',
      isOverdue: false,
      overdueDays: 0,
      overdueInstallmentsCount: 0,
      nextInstallment: null,
    }
  }

  if (loan.status === 'REFINANCED') {
    return {
      effectiveStatus: 'REFINANCED',
      isOverdue: false,
      overdueDays: 0,
      overdueInstallmentsCount: 0,
      nextInstallment: null,
    }
  }

  if (loan.status === 'ARCHIVED') {
    return {
      effectiveStatus: 'ARCHIVED',
      isOverdue: false,
      overdueDays: 0,
      overdueInstallmentsCount: 0,
      nextInstallment: null,
    }
  }

  if (loan.interestModel === 'OPEN_ENDED') {
    const todayIso = formatReferenceDateToIsoDate(referenceDate)
    if (
      loan.interestRate > 0 &&
      loan.nextInterestDueDate &&
      isValidIsoDate(loan.nextInterestDueDate) &&
      loan.nextInterestDueDate < todayIso
    ) {
      return {
        effectiveStatus: 'OVERDUE',
        isOverdue: true,
        overdueDays: Math.max(
          1,
          diffCalendarDays(loan.nextInterestDueDate, todayIso)
        ),
        overdueInstallmentsCount: 1,
        nextInstallment: null,
      }
    }

    return {
      effectiveStatus: 'OPEN_ENDED',
      isOverdue: false,
      overdueDays: 0,
      overdueInstallmentsCount: 0,
      nextInstallment: null,
    }
  }

  const todayIso = formatReferenceDateToIsoDate(referenceDate)

  const unpaidInstallments = loan.installments
    .filter((inst) => inst.status !== 'PAID')
    .slice()
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate)
      }
      return a.installmentNumber - b.installmentNumber
    })

  const nextInstallment = unpaidInstallments[0] ?? null
  const overdueInstallments = unpaidInstallments.filter(
    (inst) => inst.dueDate < todayIso
  )

  if (overdueInstallments.length > 0) {
    const oldestOverdue = overdueInstallments[0]
    const overdueDays = Math.max(
      1,
      diffCalendarDays(oldestOverdue.dueDate, todayIso)
    )

    return {
      effectiveStatus: 'OVERDUE',
      isOverdue: true,
      overdueDays,
      overdueInstallmentsCount: overdueInstallments.length,
      nextInstallment,
    }
  }

  return {
    effectiveStatus: 'ACTIVE',
    isOverdue: false,
    overdueDays: 0,
    overdueInstallmentsCount: 0,
    nextInstallment,
  }
}

export interface PaymentApplicationMeta {
  id: string
  paidAt: string
  receiptPath: string | null
  notes: string | null
}

export interface AppliedLoanPaymentResult {
  payment: LoanPayment
  installments: LoanInstallment[]
  payments: LoanPayment[]
  paidPrincipal: number
  paidInterest: number
  totalInterestDue: number
  nextInterestDueDate: string | null
  status: LoanStatus
}

function resolveInstallmentStatus(
  paidAmount: number,
  totalDue: number
): LoanInstallmentStatus {
  if (paidAmount >= totalDue - BALANCE_EPSILON) {
    return 'PAID'
  }
  if (paidAmount > BALANCE_EPSILON) {
    return 'PARTIAL'
  }
  return 'PENDING'
}

/**
 * Pure payment imputation engine.
 * - For `OPEN_ENDED` loans: deducts directly from `paidPrincipal` and marks `PAID` when settled.
 * - For scheduled loans: allocates chronologically across unpaid/partial installments following
 *   waterfall priority (`lateFee -> interest -> principal`) and marks `PAID` when balance hits 0.
 */
export function applyPaymentToLoan(
  loan: Loan,
  rawAmount: number,
  meta: PaymentApplicationMeta
): AppliedLoanPaymentResult {
  if (loan.status !== 'ACTIVE') {
    throw new LoanDomainError(
      'LOAN_NOT_ACTIVE',
      `Cannot register payment on loan with status ${loan.status}`,
      'Solo se pueden registrar abonos en préstamos activos.'
    )
  }

  const amount = roundCurrency(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new LoanDomainError(
      'INVALID_PAYMENT_AMOUNT',
      `Payment amount must be > 0, received ${rawAmount}`,
      'El monto del abono debe ser mayor a 0.'
    )
  }

  const totals = getLoanTotals(loan)
  if (amount > totals.remainingTotal + BALANCE_EPSILON) {
    throw new LoanDomainError(
      'PAYMENT_EXCEEDS_BALANCE',
      `Payment ${amount} exceeds remaining balance ${totals.remainingTotal}`,
      `El abono supera el saldo pendiente (${totals.remainingTotal.toLocaleString('es-CO')}).`
    )
  }

  const effectiveAmount = Math.min(amount, totals.remainingTotal)

  if (loan.interestModel === 'OPEN_ENDED' || loan.installments.length === 0) {
    if (loan.interestModel === 'OPEN_ENDED' && loan.interestRate > 0) {
      const placeholderPayment: LoanPayment = {
        id: meta.id,
        amount: roundCurrency(effectiveAmount),
        principalApplied: 0,
        interestApplied: 0,
        lateFeeApplied: 0,
        paidAt: meta.paidAt,
        receiptPath: meta.receiptPath,
        notes: meta.notes,
        status: 'APPLIED',
        voidedAt: null,
        voidReason: null,
      }

      const recalculated = recalculateLoanStateFromPayments({
        ...loan,
        payments: [...loan.payments, placeholderPayment],
      })

      const resolvedPayment =
        recalculated.payments.find((p) => p.id === meta.id) ??
        placeholderPayment

      return {
        payment: resolvedPayment,
        installments: recalculated.installments,
        payments: recalculated.payments,
        paidPrincipal: recalculated.paidPrincipal,
        paidInterest: recalculated.paidInterest,
        totalInterestDue: recalculated.totalInterestDue,
        nextInterestDueDate: recalculated.nextInterestDueDate,
        status: recalculated.status,
      }
    }

    const principalApplied = roundCurrency(effectiveAmount)
    const nextPaidPrincipal = roundCurrency(
      loan.paidPrincipal + principalApplied
    )
    const isFullyPaid =
      roundCurrency(loan.totalPrincipalDue - nextPaidPrincipal) <=
      BALANCE_EPSILON

    const payment: LoanPayment = {
      id: meta.id,
      amount: principalApplied,
      principalApplied,
      interestApplied: 0,
      lateFeeApplied: 0,
      paidAt: meta.paidAt,
      receiptPath: meta.receiptPath,
      notes: meta.notes,
      status: 'APPLIED',
      voidedAt: null,
      voidReason: null,
    }

    return {
      payment,
      installments: loan.installments.map((inst) => ({ ...inst })),
      payments: [...loan.payments, payment],
      paidPrincipal: isFullyPaid ? loan.totalPrincipalDue : nextPaidPrincipal,
      paidInterest: loan.paidInterest,
      totalInterestDue: loan.totalInterestDue,
      nextInterestDueDate: null,
      status: isFullyPaid ? 'PAID' : 'ACTIVE',
    }
  }

  const updatedInstallments: LoanInstallment[] = loan.installments.map(
    (inst) => ({ ...inst })
  )

  const chronologicalIndices = updatedInstallments
    .map((inst, index) => ({ inst, index }))
    .filter(({ inst }) => inst.status !== 'PAID')
    .sort((a, b) => {
      if (a.inst.dueDate !== b.inst.dueDate) {
        return a.inst.dueDate.localeCompare(b.inst.dueDate)
      }
      return a.inst.installmentNumber - b.inst.installmentNumber
    })

  let remainingPayment = roundCurrency(effectiveAmount)
  let totalLateFeeApplied = 0
  let totalInterestApplied = 0
  let totalPrincipalApplied = 0

  for (const { index } of chronologicalIndices) {
    if (remainingPayment <= 0) {
      break
    }

    const inst = updatedInstallments[index]
    const instTotalDue = roundCurrency(
      inst.principalDue + inst.interestDue + inst.lateFeeDue
    )

    // Determine how much of each bucket was already covered by prior partial payments
    // using the same waterfall order: lateFee -> interest -> principal.
    const priorPaidLateFee = Math.min(inst.paidAmount, inst.lateFeeDue)
    const priorAfterLateFee = roundCurrency(
      Math.max(0, inst.paidAmount - priorPaidLateFee)
    )
    const priorPaidInterest = Math.min(priorAfterLateFee, inst.interestDue)
    const priorAfterInterest = roundCurrency(
      Math.max(0, priorAfterLateFee - priorPaidInterest)
    )
    const priorPaidPrincipal = Math.min(priorAfterInterest, inst.principalDue)

    const dueLateFee = roundCurrency(
      Math.max(0, inst.lateFeeDue - priorPaidLateFee)
    )
    const dueInterest = roundCurrency(
      Math.max(0, inst.interestDue - priorPaidInterest)
    )
    const duePrincipal = roundCurrency(
      Math.max(0, inst.principalDue - priorPaidPrincipal)
    )

    const payLateFee = roundCurrency(Math.min(remainingPayment, dueLateFee))
    remainingPayment = roundCurrency(remainingPayment - payLateFee)

    const payInterest = roundCurrency(Math.min(remainingPayment, dueInterest))
    remainingPayment = roundCurrency(remainingPayment - payInterest)

    const payPrincipal = roundCurrency(Math.min(remainingPayment, duePrincipal))
    remainingPayment = roundCurrency(remainingPayment - payPrincipal)

    const appliedToInst = roundCurrency(payLateFee + payInterest + payPrincipal)
    const nextPaidAmount = roundCurrency(inst.paidAmount + appliedToInst)
    const nextStatus = resolveInstallmentStatus(nextPaidAmount, instTotalDue)

    updatedInstallments[index] = {
      ...inst,
      paidAmount: nextStatus === 'PAID' ? instTotalDue : nextPaidAmount,
      status: nextStatus,
    }

    totalLateFeeApplied = roundCurrency(totalLateFeeApplied + payLateFee)
    totalInterestApplied = roundCurrency(totalInterestApplied + payInterest)
    totalPrincipalApplied = roundCurrency(totalPrincipalApplied + payPrincipal)
  }

  const nextPaidPrincipal = roundCurrency(
    loan.paidPrincipal + totalPrincipalApplied
  )
  const nextPaidInterest = roundCurrency(
    loan.paidInterest + totalInterestApplied
  )
  const allPaid = updatedInstallments.every((inst) => inst.status === 'PAID')

  const payment: LoanPayment = {
    id: meta.id,
    amount: roundCurrency(
      totalPrincipalApplied + totalInterestApplied + totalLateFeeApplied
    ),
    principalApplied: totalPrincipalApplied,
    interestApplied: totalInterestApplied,
    lateFeeApplied: totalLateFeeApplied,
    paidAt: meta.paidAt,
    receiptPath: meta.receiptPath,
    notes: meta.notes,
    status: 'APPLIED',
    voidedAt: null,
    voidReason: null,
  }

  return {
    payment,
    installments: updatedInstallments,
    payments: [...loan.payments, payment],
    paidPrincipal: allPaid ? loan.totalPrincipalDue : nextPaidPrincipal,
    paidInterest: allPaid ? loan.totalInterestDue : nextPaidInterest,
    totalInterestDue: loan.totalInterestDue,
    nextInterestDueDate: null,
    status: allPaid ? 'PAID' : 'ACTIVE',
  }
}

export interface UpdateInstallmentPatch {
  dueDate?: string
  lateFeeDue?: number
}

/**
 * Pure helper to reschedule `dueDate` and/or adjust `lateFeeDue` on a non-paid installment.
 */
export function applyInstallmentUpdate(
  loan: Loan,
  installmentNumber: number,
  patch: UpdateInstallmentPatch
): LoanInstallment[] {
  if (loan.status !== 'ACTIVE') {
    throw new LoanDomainError(
      'LOAN_NOT_ACTIVE',
      `Cannot update installment on loan with status ${loan.status}`,
      'Solo se pueden modificar cuotas de préstamos activos.'
    )
  }

  if (loan.interestModel === 'OPEN_ENDED' || loan.installments.length === 0) {
    throw new LoanDomainError(
      'OPEN_ENDED_NO_INSTALLMENTS',
      'Open-ended loans do not have scheduled installments',
      'Los préstamos sin plazo fijo no tienen cuotas para reprogramar.'
    )
  }

  const targetIndex = loan.installments.findIndex(
    (inst) => inst.installmentNumber === installmentNumber
  )

  if (targetIndex === -1) {
    throw new LoanDomainError(
      'INSTALLMENT_NOT_FOUND',
      `Installment #${installmentNumber} not found in loan ${loan.id}`,
      `No se encontró la cuota #${installmentNumber}.`
    )
  }

  const target = loan.installments[targetIndex]
  if (target.status === 'PAID') {
    throw new LoanDomainError(
      'INSTALLMENT_ALREADY_PAID',
      `Installment #${installmentNumber} is already paid`,
      'No se puede modificar una cuota que ya fue pagada.'
    )
  }

  const nextDueDate = patch.dueDate ?? target.dueDate
  if (!isValidIsoDate(nextDueDate)) {
    throw new LoanDomainError(
      'INVALID_SCHEDULE',
      `Invalid installment dueDate: ${nextDueDate}`,
      'La nueva fecha de vencimiento no es válida.'
    )
  }

  const nextLateFeeDue =
    patch.lateFeeDue !== undefined
      ? roundCurrency(patch.lateFeeDue)
      : target.lateFeeDue

  if (!Number.isFinite(nextLateFeeDue) || nextLateFeeDue < 0) {
    throw new LoanDomainError(
      'INVALID_SCHEDULE',
      `Invalid lateFeeDue: ${patch.lateFeeDue}`,
      'El recargo por mora no puede ser negativo.'
    )
  }

  const nextTotalDue = roundCurrency(
    target.principalDue + target.interestDue + nextLateFeeDue
  )
  const nextStatus = resolveInstallmentStatus(target.paidAmount, nextTotalDue)

  const updated = loan.installments.map((inst, index) =>
    index === targetIndex
      ? {
          ...inst,
          dueDate: nextDueDate,
          lateFeeDue: nextLateFeeDue,
          status: nextStatus,
        }
      : { ...inst }
  )

  return updated
}

export interface RecalculatedLoanState {
  installments: LoanInstallment[]
  payments: LoanPayment[]
  paidPrincipal: number
  paidInterest: number
  totalInterestDue: number
  nextInterestDueDate: string | null
  status: LoanStatus
}

function allocatePaymentAcrossInstallments(
  installments: LoanInstallment[],
  rawAmount: number
): {
  principalApplied: number
  interestApplied: number
  lateFeeApplied: number
} {
  const chronologicalIndices = installments
    .map((inst, index) => ({ inst, index }))
    .filter(({ inst }) => inst.status !== 'PAID')
    .sort((a, b) => {
      if (a.inst.dueDate !== b.inst.dueDate) {
        return a.inst.dueDate.localeCompare(b.inst.dueDate)
      }
      return a.inst.installmentNumber - b.inst.installmentNumber
    })

  let remainingPayment = roundCurrency(rawAmount)
  let totalLateFeeApplied = 0
  let totalInterestApplied = 0
  let totalPrincipalApplied = 0

  for (const { index } of chronologicalIndices) {
    if (remainingPayment <= 0) {
      break
    }

    const inst = installments[index]
    const instTotalDue = roundCurrency(
      inst.principalDue + inst.interestDue + inst.lateFeeDue
    )

    const priorPaidLateFee = Math.min(inst.paidAmount, inst.lateFeeDue)
    const priorAfterLateFee = roundCurrency(
      Math.max(0, inst.paidAmount - priorPaidLateFee)
    )
    const priorPaidInterest = Math.min(priorAfterLateFee, inst.interestDue)
    const priorAfterInterest = roundCurrency(
      Math.max(0, priorAfterLateFee - priorPaidInterest)
    )
    const priorPaidPrincipal = Math.min(priorAfterInterest, inst.principalDue)

    const dueLateFee = roundCurrency(
      Math.max(0, inst.lateFeeDue - priorPaidLateFee)
    )
    const dueInterest = roundCurrency(
      Math.max(0, inst.interestDue - priorPaidInterest)
    )
    const duePrincipal = roundCurrency(
      Math.max(0, inst.principalDue - priorPaidPrincipal)
    )

    const payLateFee = roundCurrency(Math.min(remainingPayment, dueLateFee))
    remainingPayment = roundCurrency(remainingPayment - payLateFee)

    const payInterest = roundCurrency(Math.min(remainingPayment, dueInterest))
    remainingPayment = roundCurrency(remainingPayment - payInterest)

    const payPrincipal = roundCurrency(Math.min(remainingPayment, duePrincipal))
    remainingPayment = roundCurrency(remainingPayment - payPrincipal)

    const appliedToInst = roundCurrency(payLateFee + payInterest + payPrincipal)
    const nextPaidAmount = roundCurrency(inst.paidAmount + appliedToInst)
    const nextStatus = resolveInstallmentStatus(nextPaidAmount, instTotalDue)

    installments[index] = {
      ...inst,
      paidAmount: nextStatus === 'PAID' ? instTotalDue : nextPaidAmount,
      status: nextStatus,
    }

    totalLateFeeApplied = roundCurrency(totalLateFeeApplied + payLateFee)
    totalInterestApplied = roundCurrency(totalInterestApplied + payInterest)
    totalPrincipalApplied = roundCurrency(totalPrincipalApplied + payPrincipal)
  }

  return {
    principalApplied: totalPrincipalApplied,
    interestApplied: totalInterestApplied,
    lateFeeApplied: totalLateFeeApplied,
  }
}

/**
 * Deterministically rebuilds a loan's `paidPrincipal`, `paidInterest`, every
 * installment's `paidAmount` & `status`, and the global `ACTIVE` vs `PAID` status
 * by replaying ONLY payments with `status !== 'VOIDED'`.
 * Preserves voided payments intact for audit history.
 */
export function recalculateLoanStateFromPayments(
  loan: Loan
): RecalculatedLoanState {
  const isOpenEnded =
    loan.interestModel === 'OPEN_ENDED' || loan.installments.length === 0

  const resetInstallments: LoanInstallment[] = loan.installments.map(
    (inst) => ({
      ...inst,
      paidAmount: 0,
      status: 'PENDING',
    })
  )

  const normalizedPayments: LoanPayment[] = loan.payments.map((payment) => ({
    ...payment,
    status: payment.status === 'VOIDED' ? 'VOIDED' : 'APPLIED',
    voidedAt: payment.voidedAt ?? null,
    voidReason: payment.voidReason ?? null,
  }))

  const appliedEntries = normalizedPayments
    .map((payment, index) => ({ payment, index }))
    .filter(({ payment }) => payment.status !== 'VOIDED')
    .sort((a, b) => {
      const dateDiff = String(a.payment.paidAt).localeCompare(
        String(b.payment.paidAt)
      )
      return dateDiff !== 0 ? dateDiff : a.index - b.index
    })

  let paidPrincipal = 0
  let paidInterest = 0
  let totalInterestDue = loan.totalInterestDue
  let nextInterestDueDate: string | null = null

  if (isOpenEnded && loan.interestRate > 0) {
    const billingDay =
      loan.monthlyBillingDay ??
      (isValidIsoDate(loan.disbursementDate)
        ? extractDayFromIsoDate(loan.disbursementDate)
        : 1)

    let remainingPrincipal = roundCurrency(loan.totalPrincipalDue)
    let cycleDueDate: string | null = isValidIsoDate(loan.disbursementDate)
      ? computeNextMonthlyBillingDate(loan.disbursementDate, billingDay)
      : loan.nextInterestDueDate
    let currentCycleInterest = roundCurrency(
      remainingPrincipal * (loan.interestRate / 100)
    )
    let cycleInterestPaid = 0

    for (const { payment, index } of appliedEntries) {
      const paymentAmount = roundCurrency(Math.max(0, payment.amount))
      const interestRemainingInCycle = roundCurrency(
        Math.max(0, currentCycleInterest - cycleInterestPaid)
      )
      const interestApplied = roundCurrency(
        Math.min(paymentAmount, interestRemainingInCycle)
      )
      const excessAfterInterest = roundCurrency(paymentAmount - interestApplied)
      const principalApplied = roundCurrency(
        Math.min(excessAfterInterest, remainingPrincipal)
      )

      paidInterest = roundCurrency(paidInterest + interestApplied)
      paidPrincipal = roundCurrency(paidPrincipal + principalApplied)
      remainingPrincipal = roundCurrency(
        Math.max(0, remainingPrincipal - principalApplied)
      )
      cycleInterestPaid = roundCurrency(cycleInterestPaid + interestApplied)

      normalizedPayments[index] = {
        ...payment,
        principalApplied,
        interestApplied,
        lateFeeApplied: 0,
      }

      if (remainingPrincipal <= BALANCE_EPSILON) {
        cycleDueDate = null
        currentCycleInterest = 0
        cycleInterestPaid = 0
      } else if (
        cycleInterestPaid >= currentCycleInterest - BALANCE_EPSILON &&
        currentCycleInterest > 0
      ) {
        if (cycleDueDate && isValidIsoDate(cycleDueDate)) {
          cycleDueDate = computeNextMonthlyBillingDate(cycleDueDate, billingDay)
        }
        cycleInterestPaid = 0
        currentCycleInterest = roundCurrency(
          remainingPrincipal * (loan.interestRate / 100)
        )
      }
    }

    const isSettled = remainingPrincipal <= BALANCE_EPSILON
    const remainingCycleInterest = isSettled
      ? 0
      : roundCurrency(Math.max(0, currentCycleInterest - cycleInterestPaid))

    totalInterestDue = roundCurrency(paidInterest + remainingCycleInterest)
    nextInterestDueDate = isSettled ? null : cycleDueDate
  } else if (isOpenEnded) {
    totalInterestDue = 0
    nextInterestDueDate = null

    for (const { payment, index } of appliedEntries) {
      const remainingPrincipal = roundCurrency(
        Math.max(0, loan.totalPrincipalDue - paidPrincipal)
      )
      const applied = roundCurrency(
        Math.min(Math.max(0, payment.amount), remainingPrincipal)
      )
      paidPrincipal = roundCurrency(paidPrincipal + applied)

      normalizedPayments[index] = {
        ...payment,
        principalApplied: applied,
        interestApplied: 0,
        lateFeeApplied: 0,
      }
    }
  } else {
    for (const { payment, index } of appliedEntries) {
      const allocation = allocatePaymentAcrossInstallments(
        resetInstallments,
        Math.max(0, payment.amount)
      )
      paidPrincipal = roundCurrency(paidPrincipal + allocation.principalApplied)
      paidInterest = roundCurrency(paidInterest + allocation.interestApplied)

      normalizedPayments[index] = {
        ...payment,
        principalApplied: allocation.principalApplied,
        interestApplied: allocation.interestApplied,
        lateFeeApplied: allocation.lateFeeApplied,
      }
    }
  }

  const isFullySettled = isOpenEnded
    ? roundCurrency(loan.totalPrincipalDue - paidPrincipal) <= BALANCE_EPSILON
    : resetInstallments.every((inst) => inst.status === 'PAID')

  const nextStatus: LoanStatus =
    loan.status === 'ARCHIVED' || loan.status === 'REFINANCED'
      ? loan.status
      : isFullySettled
        ? 'PAID'
        : 'ACTIVE'

  return {
    installments: resetInstallments,
    payments: normalizedPayments,
    paidPrincipal: isFullySettled ? loan.totalPrincipalDue : paidPrincipal,
    paidInterest: isFullySettled ? totalInterestDue : paidInterest,
    totalInterestDue,
    nextInterestDueDate: nextStatus === 'ACTIVE' ? nextInterestDueDate : null,
    status: nextStatus,
  }
}

export interface VoidLoanPaymentDomainResult extends RecalculatedLoanState {
  voidedPayment: LoanPayment
}

/**
 * Pure domain operation that marks an applied payment as `'VOIDED'` with an
 * audit reason, keeps its `receiptPath` intact, and deterministically rebuilds
 * the loan's balances, installments, and global status (`PAID` -> `ACTIVE`).
 */
export function voidPaymentOnLoan(
  loan: Loan,
  paymentId: string,
  reason: string,
  voidedAt: string
): VoidLoanPaymentDomainResult {
  if (loan.status === 'ARCHIVED' || loan.status === 'REFINANCED') {
    throw new LoanDomainError(
      'LOAN_CANNOT_VOID_PAYMENT',
      `Cannot void payment on loan with status ${loan.status}`,
      'No se pueden anular abonos en préstamos archivados o refinanciados.'
    )
  }

  const targetIndex = loan.payments.findIndex(
    (payment) => payment.id === paymentId
  )
  if (targetIndex === -1) {
    throw new LoanDomainError(
      'PAYMENT_NOT_FOUND',
      `Payment ${paymentId} not found in loan ${loan.id}`,
      'No se encontró el abono especificado en este préstamo.'
    )
  }

  const targetPayment = loan.payments[targetIndex]
  if (targetPayment.status === 'VOIDED') {
    throw new LoanDomainError(
      'PAYMENT_ALREADY_VOIDED',
      `Payment ${paymentId} is already voided`,
      'Este abono ya fue anulado anteriormente.'
    )
  }

  const trimmedReason = reason.trim()
  const voidedPayment: LoanPayment = {
    ...targetPayment,
    status: 'VOIDED',
    voidedAt,
    voidReason: trimmedReason,
  }

  const updatedPayments = loan.payments.map((payment, index) =>
    index === targetIndex ? voidedPayment : payment
  )

  const recalculated = recalculateLoanStateFromPayments({
    ...loan,
    payments: updatedPayments,
  })

  return {
    ...recalculated,
    voidedPayment,
  }
}
