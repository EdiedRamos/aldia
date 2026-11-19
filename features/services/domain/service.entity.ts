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

export interface ServicePayment {
  id: string
  userId: string
  serviceId: string
  period: string
  paidAt: Date | string
  receiptUrl: string
  receiptType: ReceiptType
  receiptPath: string
}

export interface EvaluatedServiceStatus {
  statusBadge: ServiceStatusBadge
  nextPendingPeriod: string
  coveredUntilPeriod: string | null
  resolvedReferenceCode: string
}

/**
 * Evaluates a service's billing status by comparing its registered payments
 * against the period and billing day at `referenceDate`.
 */
export function evaluateServiceStatus(
  service: Service,
  payments: ServicePayment[],
  referenceDate: Date = new Date()
): EvaluatedServiceStatus {
  const paidPeriods = new Set(
    payments
      .filter((payment) => payment.serviceId === service.id)
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
