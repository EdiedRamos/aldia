import 'server-only'

import { archiveServiceUseCase } from '@/features/services/application/archive-service.use-case'
import { createServiceUseCase } from '@/features/services/application/create-service.use-case'
import {
  getReceiptPreviewUseCase,
  type GetReceiptPreviewInput,
} from '@/features/services/application/get-receipt-preview.use-case'
import {
  getServicesBoardUseCase,
  type ServicesBoard,
} from '@/features/services/application/get-services-board.use-case'
import {
  registerPaymentUseCase,
  type RegisterPaymentUseCaseInput,
} from '@/features/services/application/register-payment.use-case'
import { updateServiceUseCase } from '@/features/services/application/update-service.use-case'
import type {
  Service,
  ServicePayment,
} from '@/features/services/domain/service.entity'
import type {
  CreateServiceInput,
  UpdateServiceInput,
} from '@/features/services/domain/service.schemas'
import { firebaseReceiptStorage } from '@/features/services/infrastructure/firebase-receipt.storage'
import { firestoreServiceRepository } from '@/features/services/infrastructure/firestore-service.repository'

/**
 * Composition root for the `services` feature.
 * Binds application use cases to concrete Firestore and Firebase Storage adapters.
 */
export const servicesContainer = {
  getServicesBoard(
    userId: string,
    referenceDate?: Date
  ): Promise<ServicesBoard> {
    return getServicesBoardUseCase(userId, {
      serviceRepository: firestoreServiceRepository,
      referenceDate,
    })
  },

  createService(
    userId: string,
    rawInput: CreateServiceInput
  ): Promise<Service> {
    return createServiceUseCase(userId, rawInput, {
      serviceRepository: firestoreServiceRepository,
    })
  },

  updateService(
    serviceId: string,
    userId: string,
    rawInput: UpdateServiceInput
  ): Promise<Service> {
    return updateServiceUseCase(serviceId, userId, rawInput, {
      serviceRepository: firestoreServiceRepository,
    })
  },

  archiveService(serviceId: string, userId: string): Promise<Service> {
    return archiveServiceUseCase(serviceId, userId, {
      serviceRepository: firestoreServiceRepository,
    })
  },

  registerPayment(
    input: RegisterPaymentUseCaseInput
  ): Promise<ServicePayment[]> {
    return registerPaymentUseCase(input, {
      serviceRepository: firestoreServiceRepository,
      receiptStorage: firebaseReceiptStorage,
    })
  },

  getReceiptPreview(input: GetReceiptPreviewInput): Promise<string> {
    return getReceiptPreviewUseCase(input, {
      receiptStorage: firebaseReceiptStorage,
    })
  },
}
