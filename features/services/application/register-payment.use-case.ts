import { generatePeriodRange } from '@/core/domain/period'
import type {
  ReceiptType,
  ServicePayment,
} from '@/features/services/domain/service.entity'
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
  extension: string
}

export interface RegisterPaymentDependencies {
  serviceRepository: IServiceRepository
  receiptStorage: IReceiptStorage
}

function resolveReceiptType(contentType: string): ReceiptType {
  if (contentType === 'application/pdf') {
    return 'PDF'
  }
  return 'IMAGE'
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

  const { receiptUrl, receiptPath } = await receiptStorage.uploadReceipt({
    userId: input.userId,
    serviceId: validated.serviceId,
    period: validated.startPeriod,
    buffer: input.buffer,
    contentType: input.contentType,
    extension: input.extension,
  })

  const receiptType = resolveReceiptType(input.contentType)
  const paidAt = new Date().toISOString()

  const payments: ServicePayment[] = periods.map((period) => ({
    id: `${validated.serviceId}_${period}`,
    userId: input.userId,
    serviceId: validated.serviceId,
    period,
    paidAt,
    receiptUrl,
    receiptType,
    receiptPath,
  }))

  await serviceRepository.savePayments(payments)

  return payments
}
