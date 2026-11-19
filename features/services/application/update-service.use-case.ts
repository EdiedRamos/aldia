import type { Service } from '@/features/services/domain/service.entity'
import type { IServiceRepository } from '@/features/services/domain/service.repository'
import {
  updateServiceSchema,
  type UpdateServiceInput,
} from '@/features/services/domain/service.schemas'

export interface UpdateServiceDependencies {
  serviceRepository: IServiceRepository
}

export async function updateServiceUseCase(
  serviceId: string,
  userId: string,
  input: UpdateServiceInput,
  { serviceRepository }: UpdateServiceDependencies
): Promise<Service> {
  const parsed = updateServiceSchema.parse(input)

  return serviceRepository.update(serviceId, userId, parsed)
}
