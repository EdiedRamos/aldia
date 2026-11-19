import type { Service } from '@/features/services/domain/service.entity'
import type { IServiceRepository } from '@/features/services/domain/service.repository'

export interface ArchiveServiceDependencies {
  serviceRepository: IServiceRepository
}

export async function archiveServiceUseCase(
  serviceId: string,
  userId: string,
  { serviceRepository }: ArchiveServiceDependencies
): Promise<Service> {
  return serviceRepository.update(serviceId, userId, { status: 'ARCHIVED' })
}
