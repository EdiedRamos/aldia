import type { Service } from '@/features/services/domain/service.entity'
import type { IServiceRepository } from '@/features/services/domain/service.repository'
import {
  createServiceSchema,
  type CreateServiceInput,
} from '@/features/services/domain/service.schemas'

export interface CreateServiceDependencies {
  serviceRepository: IServiceRepository
}

export async function createServiceUseCase(
  userId: string,
  input: CreateServiceInput,
  { serviceRepository }: CreateServiceDependencies
): Promise<Service> {
  const parsed = createServiceSchema.parse(input)

  return serviceRepository.create({
    userId,
    name: parsed.name,
    billingDay: parsed.billingDay,
    startPeriod: parsed.startPeriod,
    paymentUrl: parsed.paymentUrl || undefined,
    referenceCode: parsed.referenceCode || undefined,
    status: 'ACTIVE',
  })
}
