import {
  comparePeriods,
  formatPeriod,
  formatPeriodLabel,
  isValidPeriod,
} from '@/core/domain/period'
import type { Contact } from '@/features/contacts/domain/contact.entity'
import type {
  CalendarEventItem,
  CalendarEventStatus,
  CalendarEventType,
  CalendarGridDay,
  DashboardSummary,
  MonthlyCalendarData,
} from '@/features/dashboard/domain/dashboard.types'
import {
  formatCurrency,
  INTEREST_MODEL_LABELS,
  roundCurrency,
  type Loan,
} from '@/features/loans/domain/loan.entity'
import {
  computeNextMonthlyBillingDate,
  extractDayFromIsoDate,
  formatReferenceDateToIsoDate,
  isValidIsoDate,
  parseIsoDateToUtcMs,
} from '@/features/loans/domain/loan-schedule.calculator'
import { resolveReferenceCode } from '@/features/services/domain/reference-code'
import type {
  Service,
  ServicePayment,
} from '@/features/services/domain/service.entity'

const BALANCE_EPSILON = 0.01
const MS_PER_DAY = 24 * 60 * 60 * 1000

const STATUS_SORT_PRIORITY: Record<CalendarEventStatus, number> = {
  OVERDUE: 0,
  PENDING: 1,
  PAID: 2,
}

const TYPE_SORT_PRIORITY: Record<CalendarEventType, number> = {
  LOAN_INSTALLMENT: 0,
  LOAN_OPEN_INTEREST: 1,
  SERVICE_DUE: 2,
}

export interface BuildMonthlyCalendarDataInput {
  /** 1-based calendar month (`1` = January ... `12` = December). */
  month: number
  /** 4-digit calendar year (e.g. `2026`). */
  year: number
  services: Service[]
  servicePayments: ServicePayment[]
  loans: Loan[]
  contacts: Contact[]
  /** Reference date used to evaluate `OVERDUE` vs `PENDING`. Defaults to `new Date()`. */
  referenceDate?: Date | string
}

export interface BuildUpcomingEventsRadarInput {
  services: Service[]
  servicePayments: ServicePayment[]
  loans: Loan[]
  contacts: Contact[]
  referenceDate?: Date | string
  /** Inclusive number of days ahead to scan from today (default: `7`). */
  days?: number
}

export interface UpcomingEventsRadarResult {
  upcomingEvents: CalendarEventItem[]
  upcoming3DaysCount: number
}

/**
 * Builds a valid `YYYY-MM-DD` date for `(year, month, day)`, clamping `day`
 * to the last valid calendar day of the target month (e.g., day 31 in Feb -> 28/29).
 */
export function buildClampedIsoDate(
  year: number,
  month: number,
  day: number
): string {
  const safeMonth = Math.min(12, Math.max(1, Math.floor(month)))
  const lastDayOfMonth = new Date(Date.UTC(year, safeMonth, 0)).getUTCDate()
  const clampedDay = Math.min(lastDayOfMonth, Math.max(1, Math.floor(day)))

  return `${String(year).padStart(4, '0')}-${String(safeMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

/**
 * Adds a signed integer number of calendar days to a `YYYY-MM-DD` ISO date string.
 */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const baseMs = parseIsoDateToUtcMs(isoDate)
  const target = new Date(baseMs + Math.trunc(days) * MS_PER_DAY)

  return `${String(target.getUTCFullYear()).padStart(4, '0')}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(target.getUTCDate()).padStart(2, '0')}`
}

/**
 * Generates the Monday-to-Sunday calendar matrix (35 or 42 cells) for a given `(year, month)`.
 */
export function buildMonthGridDays(
  year: number,
  month: number
): CalendarGridDay[] {
  const firstDayUtc = new Date(Date.UTC(year, month - 1, 1))
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  // Convert JS Sunday=0..Saturday=6 into Monday=0..Sunday=6
  const leadingOffset = (firstDayUtc.getUTCDay() + 6) % 7
  const totalCells = Math.ceil((leadingOffset + daysInMonth) / 7) * 7

  const firstVisibleMs =
    Date.UTC(year, month - 1, 1) - leadingOffset * MS_PER_DAY

  const days: CalendarGridDay[] = []
  for (let i = 0; i < totalCells; i += 1) {
    const cellDate = new Date(firstVisibleMs + i * MS_PER_DAY)
    const cellYear = cellDate.getUTCFullYear()
    const cellMonth = cellDate.getUTCMonth() + 1
    const cellDay = cellDate.getUTCDate()

    days.push({
      isoDate: `${String(cellYear).padStart(4, '0')}-${String(cellMonth).padStart(2, '0')}-${String(cellDay).padStart(2, '0')}`,
      dayNumber: cellDay,
      isCurrentMonth: cellYear === year && cellMonth === month,
    })
  }

  return days
}

function sortCalendarEvents(
  a: CalendarEventItem,
  b: CalendarEventItem
): number {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date)
  }

  const statusDiff =
    STATUS_SORT_PRIORITY[a.status] - STATUS_SORT_PRIORITY[b.status]
  if (statusDiff !== 0) {
    return statusDiff
  }

  const typeDiff = TYPE_SORT_PRIORITY[a.type] - TYPE_SORT_PRIORITY[b.type]
  if (typeDiff !== 0) {
    return typeDiff
  }

  return a.title.localeCompare(b.title, 'es')
}

function resolveEarliestOpenEndedBillingPeriod(
  loan: Loan,
  billingDay: number
): string | null {
  let earliestPeriod: string | null = null

  if (isValidIsoDate(loan.disbursementDate)) {
    const firstBillingDate = computeNextMonthlyBillingDate(
      loan.disbursementDate,
      billingDay
    )
    earliestPeriod = firstBillingDate.slice(0, 7)
  }

  if (loan.nextInterestDueDate && isValidIsoDate(loan.nextInterestDueDate)) {
    const nextPeriod = loan.nextInterestDueDate.slice(0, 7)
    if (!earliestPeriod || comparePeriods(nextPeriod, earliestPeriod) < 0) {
      earliestPeriod = nextPeriod
    }
  }

  return earliestPeriod
}

/**
 * Pure calendar aggregator that projects monthly service dues, scheduled loan installments,
 * and recurring `OPEN_ENDED` monthly interest charges (`interestRate > 0`) for `(year, month)`,
 * along with aggregated KPI metrics in `DashboardSummary`.
 */
export function buildMonthlyCalendarData({
  month,
  year,
  services,
  servicePayments,
  loans,
  contacts,
  referenceDate = new Date(),
}: BuildMonthlyCalendarDataInput): MonthlyCalendarData {
  const safeMonth = Math.min(12, Math.max(1, Math.floor(month)))
  const safeYear = Math.floor(year)
  const targetPeriod = formatPeriod(safeYear, safeMonth)
  const todayIso = formatReferenceDateToIsoDate(referenceDate)

  const contactsById = new Map<string, Contact>()
  for (const contact of contacts) {
    contactsById.set(contact.id, contact)
  }

  const paidServiceKeys = new Set<string>()
  for (const payment of servicePayments) {
    paidServiceKeys.add(`${payment.serviceId}::${payment.period}`)
  }

  const events: CalendarEventItem[] = []

  let servicesTotalDue = 0
  let servicesPaid = 0
  let loansExpectedCollection = 0
  let loansCollected = 0
  let activePrincipalTotal = 0

  // 1. Project active services due in the target month
  for (const service of services) {
    if (service.status !== 'ACTIVE') {
      continue
    }

    if (
      isValidPeriod(service.startPeriod) &&
      comparePeriods(service.startPeriod, targetPeriod) > 0
    ) {
      continue
    }

    const dueDate = buildClampedIsoDate(safeYear, safeMonth, service.billingDay)
    const isPaid = paidServiceKeys.has(`${service.id}::${targetPeriod}`)
    const status: CalendarEventStatus = isPaid
      ? 'PAID'
      : dueDate < todayIso
        ? 'OVERDUE'
        : 'PENDING'

    const resolvedReference = resolveReferenceCode(
      service.referenceCode,
      targetPeriod
    )
    const subtitle = resolvedReference
      ? `Servicio mensual · Ref: ${resolvedReference}`
      : `Servicio mensual · ${formatPeriodLabel(targetPeriod)}`

    events.push({
      id: `service:${service.id}:${targetPeriod}`,
      date: dueDate,
      type: 'SERVICE_DUE',
      title: service.name,
      subtitle,
      amount: null,
      status,
      referenceId: service.id,
    })

    servicesTotalDue += 1
    if (isPaid) {
      servicesPaid += 1
    }
  }

  // 2. Project loan installments, OPEN_ENDED monthly interest, and active principal
  for (const loan of loans) {
    const remainingPrincipal = roundCurrency(
      Math.max(0, loan.totalPrincipalDue - loan.paidPrincipal)
    )

    if (loan.status === 'ACTIVE') {
      activePrincipalTotal = roundCurrency(
        activePrincipalTotal + remainingPrincipal
      )
    }

    const contact = contactsById.get(loan.contactId)
    const guarantor = contact?.guarantorContactId
      ? contactsById.get(contact.guarantorContactId)
      : undefined
    const contactName = contact?.name ?? 'Contacto eliminado'
    const isViaIntermediary = !contact?.phone && Boolean(guarantor)
    const guarantorName = guarantor?.name
    const effectivePhone = contact?.phone ?? guarantor?.phone ?? undefined

    if (loan.interestModel === 'OPEN_ENDED') {
      if (
        loan.status !== 'ACTIVE' ||
        loan.interestRate <= 0 ||
        remainingPrincipal <= BALANCE_EPSILON
      ) {
        continue
      }

      const billingDay =
        loan.monthlyBillingDay !== null && loan.monthlyBillingDay !== undefined
          ? Math.min(31, Math.max(1, Math.floor(loan.monthlyBillingDay)))
          : isValidIsoDate(loan.disbursementDate)
            ? extractDayFromIsoDate(loan.disbursementDate)
            : 1

      const earliestPeriod = resolveEarliestOpenEndedBillingPeriod(
        loan,
        billingDay
      )
      if (earliestPeriod && comparePeriods(targetPeriod, earliestPeriod) < 0) {
        continue
      }

      const monthlyInterest = roundCurrency(
        remainingPrincipal * (loan.interestRate / 100)
      )
      if (monthlyInterest <= 0) {
        continue
      }

      const projectedDate = buildClampedIsoDate(safeYear, safeMonth, billingDay)

      let status: CalendarEventStatus =
        projectedDate < todayIso ? 'OVERDUE' : 'PENDING'
      let collectedForCycle = 0
      let eventAmount = monthlyInterest

      if (
        loan.nextInterestDueDate &&
        isValidIsoDate(loan.nextInterestDueDate)
      ) {
        const nextDuePeriod = loan.nextInterestDueDate.slice(0, 7)
        const periodComparison = comparePeriods(targetPeriod, nextDuePeriod)

        if (periodComparison < 0) {
          status = 'PAID'
          collectedForCycle = monthlyInterest
          eventAmount = monthlyInterest
        } else if (periodComparison === 0) {
          const remainingCycleInterest =
            loan.totalInterestDue > 0
              ? roundCurrency(
                  Math.max(0, loan.totalInterestDue - loan.paidInterest)
                )
              : monthlyInterest
          const paidInCurrentCycle = roundCurrency(
            Math.max(0, monthlyInterest - remainingCycleInterest)
          )

          collectedForCycle = paidInCurrentCycle
          eventAmount =
            remainingCycleInterest > BALANCE_EPSILON
              ? remainingCycleInterest
              : monthlyInterest
          status = projectedDate < todayIso ? 'OVERDUE' : 'PENDING'
        }
      }

      loansExpectedCollection = roundCurrency(
        loansExpectedCollection + monthlyInterest
      )
      loansCollected = roundCurrency(loansCollected + collectedForCycle)

      const subtitle =
        status !== 'PAID' && collectedForCycle > BALANCE_EPSILON
          ? `${loan.interestRate}% mensual · Abonado ${formatCurrency(collectedForCycle)} de ${formatCurrency(monthlyInterest)}`
          : `${loan.interestRate}% mensual sobre capital de ${formatCurrency(remainingPrincipal)}`

      events.push({
        id: `loan-open:${loan.id}:${targetPeriod}`,
        date: projectedDate,
        type: 'LOAN_OPEN_INTEREST',
        title: `Interés mensual · ${contactName}`,
        subtitle,
        amount: eventAmount,
        status,
        referenceId: loan.id,
        contactName,
        ...(effectivePhone ? { phone: effectivePhone } : {}),
        ...(guarantorName ? { guarantorName } : {}),
        isViaIntermediary,
        remainingPrincipal,
      })

      continue
    }

    // Scheduled loan models: SINGLE_PAYMENT, NO_INTEREST, INTEREST_ONLY_BALLOON, DECLINING_BALANCE
    if (loan.status === 'ARCHIVED' || loan.status === 'REFINANCED') {
      continue
    }

    const totalInstallments = loan.installments.length
    for (const installment of loan.installments) {
      if (
        !isValidIsoDate(installment.dueDate) ||
        !installment.dueDate.startsWith(`${targetPeriod}-`)
      ) {
        continue
      }

      const installmentTotalDue = roundCurrency(
        installment.principalDue +
          installment.interestDue +
          installment.lateFeeDue
      )
      const paidAmount = roundCurrency(
        Math.min(installmentTotalDue, Math.max(0, installment.paidAmount))
      )
      const remainingAmount = roundCurrency(
        Math.max(0, installmentTotalDue - paidAmount)
      )
      const isPaid =
        installment.status === 'PAID' || remainingAmount <= BALANCE_EPSILON

      const status: CalendarEventStatus = isPaid
        ? 'PAID'
        : installment.dueDate < todayIso
          ? 'OVERDUE'
          : 'PENDING'

      loansExpectedCollection = roundCurrency(
        loansExpectedCollection + installmentTotalDue
      )
      loansCollected = roundCurrency(
        loansCollected + (isPaid ? installmentTotalDue : paidAmount)
      )

      const title =
        loan.interestModel === 'SINGLE_PAYMENT'
          ? `Pago único · ${contactName}`
          : `Cuota ${installment.installmentNumber}/${totalInstallments} · ${contactName}`

      const baseSubtitle = INTEREST_MODEL_LABELS[loan.interestModel]
      const subtitle =
        !isPaid && paidAmount > BALANCE_EPSILON
          ? `${baseSubtitle} · Abonado ${formatCurrency(paidAmount)} de ${formatCurrency(installmentTotalDue)}`
          : baseSubtitle

      events.push({
        id: `loan-inst:${loan.id}:${installment.installmentNumber}`,
        date: installment.dueDate,
        type: 'LOAN_INSTALLMENT',
        title,
        subtitle,
        amount: isPaid ? installmentTotalDue : remainingAmount,
        status,
        referenceId: loan.id,
        contactName,
        ...(effectivePhone ? { phone: effectivePhone } : {}),
        ...(guarantorName ? { guarantorName } : {}),
        isViaIntermediary,
        remainingPrincipal,
      })
    }
  }

  events.sort(sortCalendarEvents)

  const overdueCount = events.filter(
    (event) => event.status === 'OVERDUE'
  ).length

  const summary: DashboardSummary = {
    servicesTotalDue,
    servicesPaid,
    loansExpectedCollection,
    loansCollected,
    activePrincipalTotal,
    overdueCount,
  }

  return {
    month: safeMonth,
    year: safeYear,
    period: targetPeriod,
    todayIso,
    events,
    summary,
  }
}

/**
 * Collects upcoming non-paid commitments starting from `referenceDate` through
 * `referenceDate + days` (default 7), handling month/year boundaries cleanly.
 */
export function buildUpcomingEventsRadar({
  services,
  servicePayments,
  loans,
  contacts,
  referenceDate = new Date(),
  days = 7,
}: BuildUpcomingEventsRadarInput): UpcomingEventsRadarResult {
  const safeDays = Math.max(0, Math.floor(days))
  const todayIso = formatReferenceDateToIsoDate(referenceDate)
  const endIso = addDaysToIsoDate(todayIso, safeDays)
  const end3DaysIso = addDaysToIsoDate(todayIso, 3)

  const [startYear, startMonth] = todayIso.split('-').map(Number)
  const [endYear, endMonth] = endIso.split('-').map(Number)

  const monthsToScan: Array<{ year: number; month: number }> = [
    { year: startYear, month: startMonth },
  ]

  let cursorYear = startYear
  let cursorMonth = startMonth
  while (cursorYear < endYear || cursorMonth < endMonth) {
    if (cursorMonth === 12) {
      cursorYear += 1
      cursorMonth = 1
    } else {
      cursorMonth += 1
    }
    monthsToScan.push({ year: cursorYear, month: cursorMonth })
  }

  const seenIds = new Set<string>()
  const upcomingEvents: CalendarEventItem[] = []

  for (const target of monthsToScan) {
    const monthlyData = buildMonthlyCalendarData({
      month: target.month,
      year: target.year,
      services,
      servicePayments,
      loans,
      contacts,
      referenceDate: todayIso,
    })

    for (const event of monthlyData.events) {
      if (
        event.status !== 'PAID' &&
        event.date >= todayIso &&
        event.date <= endIso &&
        !seenIds.has(event.id)
      ) {
        seenIds.add(event.id)
        upcomingEvents.push(event)
      }
    }
  }

  upcomingEvents.sort(sortCalendarEvents)

  const upcoming3DaysCount = upcomingEvents.filter(
    (event) => event.date <= end3DaysIso
  ).length

  return {
    upcomingEvents,
    upcoming3DaysCount,
  }
}
