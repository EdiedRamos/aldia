import { generatePeriodRange } from '@/core/domain/period'
import { validateReceiptFile } from '@/features/services/domain/receipt.policy'
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
