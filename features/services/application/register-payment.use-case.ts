import { generatePeriodRange } from '@/core/domain/period'
import {
  ReceiptPolicyError,
  validateReceiptFile,
} from '@/features/services/domain/receipt.policy'
import type { ServicePayment } from '@/features/services/domain/service.entity'
import type {
  IReceiptStorage,
  IServiceRepository,
} from '@/features/services/domain/service.repository'
import { registerPaymentSchema } from '@/features/services/domain/service.schemas'

export interface RegisterPaymentUseCaseInput {
  userId: string
  serviceId: string
  startPeriod: string
  monthsCovered: number
  buffer: Buffer
  contentType: string
  fileName?: string
  extension?: string
}

export interface RegisterPaymentDependencies {
  serviceRepository: IServiceRepository
  receiptStorage: IReceiptStorage
}

export async function registerPaymentUseCase(
  input: RegisterPaymentUseCaseInput,
  { serviceRepository, receiptStorage }: RegisterPaymentDependencies
): Promise<ServicePayment[]> {
  const validated = registerPaymentSchema.parse({
    serviceId: input.serviceId,
    startPeriod: input.startPeriod,
    monthsCovered: input.monthsCovered,
  })

  if (!validated.startPeriod) {
    throw new Error('Start period is required to register a payment')
  }

  const validatedFile = validateReceiptFile({
    sizeBytes: input.buffer.byteLength,
    contentType: input.contentType,
    fileName: input.fileName,
    extension: input.extension,
  })

  const service = await serviceRepository.findById(
    validated.serviceId,
    input.userId
  )
  if (!service) {
    throw new Error('Service not found or access denied')
  }

  const periods = generatePeriodRange(
    validated.startPeriod,
    validated.monthsCovered
  )

  const existingPayments = await serviceRepository.findPaymentsByUserId(
    input.userId
  )
  const paidPeriodsForService = new Set(
    existingPayments
      .filter((payment) => payment.serviceId === validated.serviceId)
      .map((payment) => payment.period)
  )
  const conflictingPeriod = periods.find((period) =>
    paidPeriodsForService.has(period)
  )
  if (conflictingPeriod) {
    throw new ReceiptPolicyError(
      'RECEIPT_ALREADY_EXISTS',
      `Service payment receipt already exists for service ${validated.serviceId} and period ${conflictingPeriod}`,
      `El periodo ${conflictingPeriod} ya tiene un comprobante guardado y no puede editarse ni reemplazarse.`
    )
  }

  const { receiptUrl, receiptPath } = await receiptStorage.uploadReceipt({
    userId: input.userId,
    serviceId: validated.serviceId,
    period: validated.startPeriod,
    buffer: input.buffer,
    contentType: validatedFile.contentType,
    extension: validatedFile.extension,
  })

  const paidAt = new Date().toISOString()

  const payments: ServicePayment[] = periods.map((period) => ({
    id: `${validated.serviceId}_${period}`,
    userId: input.userId,
    serviceId: validated.serviceId,
    period,
    paidAt,
    receiptUrl,
    receiptType: validatedFile.receiptType,
    receiptPath,
  }))

  await serviceRepository.savePayments(payments)

  return payments
}
