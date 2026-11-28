import {
  comparePeriods,
  getCurrentPeriod,
  getNextPeriod,
} from '@/core/domain/period'
import { resolveReferenceCode } from '@/features/services/domain/reference-code'

export type ServiceStatus = 'ACTIVE' | 'ARCHIVED'

export type ServiceStatusBadge =
  'UP_TO_DATE' | 'PENDING' | 'OVERDUE' | 'ARCHIVED'

export interface Service {
  id: string
  userId: string
  name: string
  billingDay: number
  startPeriod: string
  paymentUrl?: string
  referenceCode?: string
  status: ServiceStatus
  createdAt: Date | string
}

export type ReceiptType = 'IMAGE' | 'PDF' | string

export type ServicePaymentStatus = 'ACTIVE' | 'VOIDED'

export interface ServicePayment {
  id: string
  userId: string
  serviceId: string
  period: string
  paidAt: Date | string
  receiptUrl: string
  receiptType: ReceiptType
  receiptPath: string
  status?: ServicePaymentStatus
  voidedAt?: Date | string | null
  voidReason?: string | null
}

export type ServiceDomainErrorCode =
  | 'SERVICE_NOT_FOUND'
  | 'SERVICE_ARCHIVED'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_ALREADY_VOIDED'
  | 'PAYMENT_NOT_LATEST_ACTIVE'

export class ServiceDomainError extends Error {
  readonly code: ServiceDomainErrorCode
  readonly userMessage: string

  constructor(
    code: ServiceDomainErrorCode,
    message: string,
    userMessage: string
  ) {
    super(message)
    this.name = 'ServiceDomainError'
    this.code = code
    this.userMessage = userMessage
  }
}

export interface EvaluatedServiceStatus {
  statusBadge: ServiceStatusBadge
  nextPendingPeriod: string
  coveredUntilPeriod: string | null
  resolvedReferenceCode: string
}

export interface VoidServicePaymentDomainResult {
  voidedPayment: ServicePayment
  payments: ServicePayment[]
  evaluatedStatus: EvaluatedServiceStatus
  activePaymentsCount: number
}

/**
 * Resolves a service payment's status, treating legacy documents without an
 * explicit `status` field as `'ACTIVE'` for backwards compatibility.
 */
export function getServicePaymentStatus(
  payment: Pick<ServicePayment, 'status'>
): ServicePaymentStatus {
  return payment.status === 'VOIDED' ? 'VOIDED' : 'ACTIVE'
}

/**
 * Returns `true` when the payment is active (non-voided) and counts toward
 * service coverage, totals, and dashboard metrics.
 */
export function isActiveServicePayment(
  payment: Pick<ServicePayment, 'status'>
): boolean {
  return getServicePaymentStatus(payment) === 'ACTIVE'
}

/**
 * Filters a list of service payments to only active (non-voided) entries.
 */
export function getActiveServicePayments(
  payments: ServicePayment[]
): ServicePayment[] {
  return payments.filter((payment) => isActiveServicePayment(payment))
}

function getPaidAtTimestamp(paidAt: Date | string): number {
  const date = paidAt instanceof Date ? paidAt : new Date(paidAt)
  const time = date.getTime()
  return Number.isNaN(time) ? 0 : time
}

/**
 * Returns the chronologically latest active (`ACTIVE`) payment for a given service,
 * ignoring `VOIDED` entries. Periods are compared first (`YYYY-MM`), breaking ties
 * by `paidAt` timestamp descending.
 */
export function getLatestActiveServicePayment(
  serviceId: string,
  payments: ServicePayment[]
): ServicePayment | null {
  const activeForService = payments.filter(
    (payment) =>
      payment.serviceId === serviceId && isActiveServicePayment(payment)
  )

  if (activeForService.length === 0) {
    return null
  }

  return activeForService.reduce((latest, candidate) => {
    const periodDiff = comparePeriods(candidate.period, latest.period)
    if (periodDiff !== 0) {
      return periodDiff > 0 ? candidate : latest
    }

    const timeDiff =
      getPaidAtTimestamp(candidate.paidAt) - getPaidAtTimestamp(latest.paidAt)
    if (timeDiff !== 0) {
      return timeDiff > 0 ? candidate : latest
    }

    return candidate.id.localeCompare(latest.id) > 0 ? candidate : latest
  })
}

/**
 * Pure domain eligibility rule: a payment can be voided if and only if the service
 * is not archived, the payment is `'ACTIVE'`, and it is chronologically the latest
 * active payment registered for that service.
 */
export function isPaymentEligibleForVoid(
  service: Pick<Service, 'id' | 'status'>,
  payments: ServicePayment[],
  paymentId: string
): boolean {
  if (service.status === 'ARCHIVED') {
    return false
  }

  const latestActive = getLatestActiveServicePayment(service.id, payments)
  return latestActive !== null && latestActive.id === paymentId
}

/**
 * Evaluates a service's billing status by comparing its active (non-voided)
 * registered payments against the period and billing day at `referenceDate`.
 */
export function evaluateServiceStatus(
  service: Service,
  payments: ServicePayment[],
  referenceDate: Date = new Date()
): EvaluatedServiceStatus {
  const paidPeriods = new Set(
    payments
      .filter(
        (payment) =>
          payment.serviceId === service.id && isActiveServicePayment(payment)
      )
      .map((payment) => payment.period)
  )

  let cursor = service.startPeriod
  let coveredUntilPeriod: string | null = null

  while (paidPeriods.has(cursor)) {
    coveredUntilPeriod = cursor
    cursor = getNextPeriod(cursor)
  }

  const nextPendingPeriod = cursor
  const resolvedReferenceCode = resolveReferenceCode(
    service.referenceCode,
    nextPendingPeriod
  )

  if (service.status === 'ARCHIVED') {
    return {
      statusBadge: 'ARCHIVED',
      nextPendingPeriod,
      coveredUntilPeriod,
      resolvedReferenceCode,
    }
  }

  const currentPeriod = getCurrentPeriod(referenceDate)
  const comparison = comparePeriods(nextPendingPeriod, currentPeriod)

  if (comparison > 0) {
    return {
      statusBadge: 'UP_TO_DATE',
      nextPendingPeriod,
      coveredUntilPeriod,
      resolvedReferenceCode,
    }
  }

  if (comparison < 0) {
    return {
      statusBadge: 'OVERDUE',
      nextPendingPeriod,
      coveredUntilPeriod,
      resolvedReferenceCode,
    }
  }

  const currentDay = referenceDate.getDate()
  const statusBadge: ServiceStatusBadge =
    currentDay > service.billingDay ? 'OVERDUE' : 'PENDING'

  return {
    statusBadge,
    nextPendingPeriod,
    coveredUntilPeriod,
    resolvedReferenceCode,
  }
}

/**
 * Pure domain operation that voids an active service payment for audit-safe
 * error correction: preserves the payment record and its immutable receipt
 * metadata (`receiptPath`, `receiptUrl`), marks it as `'VOIDED'` with reason
 * and timestamp, and deterministically recomputes the service's resulting
 * status, `nextPendingPeriod`, `coveredUntilPeriod`, and `resolvedReferenceCode`.
 */
export function voidPaymentOnService(
  service: Service,
  payments: ServicePayment[],
  paymentId: string,
  reason: string,
  voidedAt: string,
  referenceDate: Date = new Date()
): VoidServicePaymentDomainResult {
  if (service.status === 'ARCHIVED') {
    throw new ServiceDomainError(
      'SERVICE_ARCHIVED',
      `Cannot void payment on archived service ${service.id}`,
      'No se pueden anular pagos en servicios archivados.'
    )
  }

  const targetIndex = payments.findIndex(
    (payment) => payment.id === paymentId && payment.serviceId === service.id
  )
  if (targetIndex === -1) {
    throw new ServiceDomainError(
      'PAYMENT_NOT_FOUND',
      `Payment ${paymentId} not found for service ${service.id}`,
      'No se encontró el pago especificado en este servicio.'
    )
  }

  const targetPayment = payments[targetIndex]
  if (getServicePaymentStatus(targetPayment) === 'VOIDED') {
    throw new ServiceDomainError(
      'PAYMENT_ALREADY_VOIDED',
      `Payment ${paymentId} is already voided`,
      'Este pago ya fue anulado anteriormente.'
    )
  }

  if (!isPaymentEligibleForVoid(service, payments, targetPayment.id)) {
    throw new ServiceDomainError(
      'PAYMENT_NOT_LATEST_ACTIVE',
      `Payment ${paymentId} is not the latest active payment for service ${service.id}`,
      'Solo se puede anular el último pago activo registrado en este servicio.'
    )
  }

  const voidedPayment: ServicePayment = {
    ...targetPayment,
    status: 'VOIDED',
    voidedAt,
    voidReason: reason.trim(),
  }

  const updatedPayments = payments.map((payment, index) =>
    index === targetIndex ? voidedPayment : payment
  )

  const evaluatedStatus = evaluateServiceStatus(
    service,
    updatedPayments,
    referenceDate
  )

  const activePaymentsCount = updatedPayments.filter(
    (payment) =>
      payment.serviceId === service.id && isActiveServicePayment(payment)
  ).length

  return {
    voidedPayment,
    payments: updatedPayments,
    evaluatedStatus,
    activePaymentsCount,
  }
}
