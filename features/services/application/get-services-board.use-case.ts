import { comparePeriods } from '@/core/domain/period'
import {
  evaluateServiceStatus,
  type EvaluatedServiceStatus,
  type Service,
  type ServicePayment,
  type ServiceStatusBadge,
} from '@/features/services/domain/service.entity'
import type { IServiceRepository } from '@/features/services/domain/service.repository'

export interface EnrichedService extends Service, EvaluatedServiceStatus {
  payments: ServicePayment[]
}

export interface ServicesBoard {
  active: EnrichedService[]
  archived: EnrichedService[]
}

const STATUS_PRIORITY: Record<ServiceStatusBadge, number> = {
  OVERDUE: 0,
  PENDING: 1,
  UP_TO_DATE: 2,
  ARCHIVED: 3,
}

export interface GetServicesBoardDependencies {
  serviceRepository: IServiceRepository
  referenceDate?: Date
}

export async function getServicesBoardUseCase(
  userId: string,
  {
    serviceRepository,
    referenceDate = new Date(),
  }: GetServicesBoardDependencies
): Promise<ServicesBoard> {
  const [services, allPayments] = await Promise.all([
    serviceRepository.findByUserId(userId),
    serviceRepository.findPaymentsByUserId(userId),
  ])

  const paymentsByServiceId = new Map<string, ServicePayment[]>()
  for (const payment of allPayments) {
    const list = paymentsByServiceId.get(payment.serviceId) ?? []
    list.push(payment)
    paymentsByServiceId.set(payment.serviceId, list)
  }

  const enriched: EnrichedService[] = services.map((service) => {
    const servicePayments = (paymentsByServiceId.get(service.id) ?? [])
      .slice()
      .sort((a, b) => comparePeriods(b.period, a.period))

    const evaluated = evaluateServiceStatus(
      service,
      servicePayments,
      referenceDate
    )

    return {
      ...service,
      ...evaluated,
      payments: servicePayments,
    }
  })

  const active = enriched
    .filter((service) => service.status === 'ACTIVE')
    .sort((a, b) => {
      const priorityDiff =
        STATUS_PRIORITY[a.statusBadge] - STATUS_PRIORITY[b.statusBadge]
      if (priorityDiff !== 0) {
        return priorityDiff
      }
      return a.billingDay - b.billingDay
    })

  const archived = enriched
    .filter((service) => service.status === 'ARCHIVED')
    .sort((a, b) => a.billingDay - b.billingDay)

  return {
    active,
    archived,
  }
}
