import {
  isPaymentEligibleForVoid,
  ServiceDomainError,
  voidPaymentOnService,
  type EvaluatedServiceStatus,
  type Service,
  type ServicePayment,
} from '@/features/services/domain/service.entity'
import type { IServiceRepository } from '@/features/services/domain/service.repository'
import { voidServicePaymentSchema } from '@/features/services/domain/service.schemas'

export interface VoidServicePaymentUseCaseInput {
  userId: string
  serviceId: string
  paymentId: string
  reason: string
}

export interface VoidServicePaymentDependencies {
  serviceRepository: IServiceRepository
  now?: () => Date
}

export interface VoidServicePaymentResult {
  service: Service
  voidedPayment: ServicePayment
  evaluatedStatus: EvaluatedServiceStatus
}

/**
 * Voids an active service payment for audit-safe error correction:
 * preserves the payment document and its immutable receipt in Firebase Storage,
 * records `status: 'VOIDED'`, `voidedAt`, and `voidReason` atomically, and
 * reverts the service's evaluated period/status so the period can be paid again.
 */
export async function voidServicePaymentUseCase(
  input: VoidServicePaymentUseCaseInput,
  { serviceRepository, now = () => new Date() }: VoidServicePaymentDependencies
): Promise<VoidServicePaymentResult> {
  const userId = input.userId.trim()
  if (!userId) {
    throw new Error('Unauthorized: userId is required')
  }

  const parsed = voidServicePaymentSchema.parse({
    serviceId: input.serviceId,
    paymentId: input.paymentId,
    reason: input.reason,
  })

  const [service, allPayments] = await Promise.all([
    serviceRepository.findById(parsed.serviceId, userId),
    serviceRepository.findPaymentsByUserId(userId),
  ])

  if (!service) {
    throw new ServiceDomainError(
      'SERVICE_NOT_FOUND',
      `Service ${parsed.serviceId} not found for user ${userId}`,
      'El servicio no existe o no tienes acceso a él.'
    )
  }

  const servicePayments = allPayments.filter(
    (payment) => payment.serviceId === service.id
  )
  const targetPayment = servicePayments.find(
    (payment) => payment.id === parsed.paymentId
  )
  if (
    targetPayment &&
    service.status !== 'ARCHIVED' &&
    targetPayment.status !== 'VOIDED' &&
    !isPaymentEligibleForVoid(service, servicePayments, parsed.paymentId)
  ) {
    throw new ServiceDomainError(
      'PAYMENT_NOT_LATEST_ACTIVE',
      `Payment ${parsed.paymentId} is not the latest active payment for service ${service.id}`,
      'Solo se puede anular el último pago activo registrado en este servicio.'
    )
  }

  const referenceDate = now()
  const voidedAt = referenceDate.toISOString()

  const domainResult = voidPaymentOnService(
    service,
    servicePayments,
    parsed.paymentId,
    parsed.reason,
    voidedAt,
    referenceDate
  )

  const persistedVoidedPayment = await serviceRepository.voidPayment({
    userId,
    serviceId: service.id,
    paymentId: parsed.paymentId,
    voidedAt,
    voidReason: parsed.reason,
    nextPendingPeriod: domainResult.evaluatedStatus.nextPendingPeriod,
    coveredUntilPeriod: domainResult.evaluatedStatus.coveredUntilPeriod,
  })

  return {
    service,
    voidedPayment: persistedVoidedPayment,
    evaluatedStatus: domainResult.evaluatedStatus,
  }
}
