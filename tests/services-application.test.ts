import { describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import { archiveServiceUseCase } from '@/features/services/application/archive-service.use-case'
import { createServiceUseCase } from '@/features/services/application/create-service.use-case'
import { getReceiptPreviewUseCase } from '@/features/services/application/get-receipt-preview.use-case'
import { getServicesBoardUseCase } from '@/features/services/application/get-services-board.use-case'
import { registerPaymentUseCase } from '@/features/services/application/register-payment.use-case'
import { updateServiceUseCase } from '@/features/services/application/update-service.use-case'
import { voidServicePaymentUseCase } from '@/features/services/application/void-service-payment.use-case'
import {
  MAX_RECEIPT_SIZE_BYTES,
  ReceiptPolicyError,
} from '@/features/services/domain/receipt.policy'
import {
  ServiceDomainError,
  type Service,
  type ServicePayment,
} from '@/features/services/domain/service.entity'
import type {
  IReceiptStorage,
  IServiceRepository,
} from '@/features/services/domain/service.repository'

function createMockRepository(
  overrides: Partial<IServiceRepository> = {}
): IServiceRepository {
  return {
    findByUserId: vi.fn().mockResolvedValue([]),
    findPaymentsByUserId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    savePayments: vi.fn().mockResolvedValue(undefined),
    voidPayment: vi.fn(),
    ...overrides,
  }
}

function createMockReceiptStorage(
  overrides: Partial<IReceiptStorage> = {}
): IReceiptStorage {
  return {
    uploadReceipt: vi.fn().mockResolvedValue({
      receiptUrl: 'https://storage.example.com/receipt.jpg',
      receiptPath: 'receipts/u1/s1/2026-11.jpg',
    }),
    getReceiptReadUrl: vi
      .fn()
      .mockResolvedValue('https://storage.example.com/signed-receipt.jpg'),
    deleteReceipt: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('features/services/application use cases', () => {
  it('getServicesBoardUseCase separates active and archived and sorts active by priority (OVERDUE -> PENDING -> UP_TO_DATE)', async () => {
    const services: Service[] = [
      {
        id: 's-uptodate',
        userId: 'u1',
        name: 'Agua',
        billingDay: 5,
        startPeriod: '2026-12',
        status: 'ACTIVE',
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 's-pending',
        userId: 'u1',
        name: 'Internet',
        billingDay: 25,
        startPeriod: '2026-11',
        status: 'ACTIVE',
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 's-overdue',
        userId: 'u1',
        name: 'Energía',
        billingDay: 10,
        startPeriod: '2026-11',
        status: 'ACTIVE',
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 's-archived',
        userId: 'u1',
        name: 'Gas Antiguo',
        billingDay: 15,
        startPeriod: '2026-01',
        status: 'ARCHIVED',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]

    const payments: ServicePayment[] = []
    const serviceRepository = createMockRepository({
      findByUserId: vi.fn().mockResolvedValue(services),
      findPaymentsByUserId: vi.fn().mockResolvedValue(payments),
    })

    const board = await getServicesBoardUseCase('u1', {
      serviceRepository,
      referenceDate: new Date(2026, 10, 18), // 2026-11-18
    })

    expect(board.active.map((s) => s.id)).toEqual([
      's-overdue',
      's-pending',
      's-uptodate',
    ])
    expect(board.archived.map((s) => s.id)).toEqual(['s-archived'])
  })

  it('createServiceUseCase, updateServiceUseCase, and archiveServiceUseCase delegate properly', async () => {
    const createdService: Service = {
      id: 's1',
      userId: 'u1',
      name: 'Arriendo',
      billingDay: 5,
      startPeriod: '2026-11',
      status: 'ACTIVE',
      createdAt: '2026-11-01T00:00:00Z',
    }
    const serviceRepository = createMockRepository({
      create: vi.fn().mockResolvedValue(createdService),
      update: vi
        .fn()
        .mockResolvedValue({ ...createdService, status: 'ARCHIVED' }),
    })

    const created = await createServiceUseCase(
      'u1',
      {
        name: 'Arriendo',
        billingDay: 5,
        startPeriod: '2026-11',
        paymentUrl: '',
        referenceCode: '{YY}{MM}01',
      },
      { serviceRepository }
    )
    expect(created.id).toBe('s1')
    expect(serviceRepository.create).toHaveBeenCalledWith({
      userId: 'u1',
      name: 'Arriendo',
      billingDay: 5,
      startPeriod: '2026-11',
      paymentUrl: undefined,
      referenceCode: '{YY}{MM}01',
      status: 'ACTIVE',
    })

    await updateServiceUseCase(
      's1',
      'u1',
      { billingDay: 10 },
      { serviceRepository }
    )
    expect(serviceRepository.update).toHaveBeenCalledWith('s1', 'u1', {
      billingDay: 10,
    })

    await archiveServiceUseCase('s1', 'u1', { serviceRepository })
    expect(serviceRepository.update).toHaveBeenCalledWith('s1', 'u1', {
      status: 'ARCHIVED',
    })
  })

  it('registerPaymentUseCase uploads receipt once and saves batch payments for multiple covered months', async () => {
    const service: Service = {
      id: 's1',
      userId: 'u1',
      name: 'Internet',
      billingDay: 15,
      startPeriod: '2026-11',
      status: 'ACTIVE',
      createdAt: '2026-11-01T00:00:00Z',
    }
    const serviceRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(service),
    })
    const receiptStorage = createMockReceiptStorage()

    const payments = await registerPaymentUseCase(
      {
        userId: 'u1',
        serviceId: 's1',
        startPeriod: '2026-11',
        monthsCovered: 3,
        buffer: Buffer.from('fake-image'),
        contentType: 'image/jpeg',
        extension: 'jpg',
      },
      { serviceRepository, receiptStorage }
    )

    expect(receiptStorage.uploadReceipt).toHaveBeenCalledTimes(1)
    expect(receiptStorage.uploadReceipt).toHaveBeenCalledWith({
      userId: 'u1',
      serviceId: 's1',
      period: '2026-11',
      buffer: Buffer.from('fake-image'),
      contentType: 'image/jpeg',
      extension: 'jpg',
    })

    expect(payments).toHaveLength(3)
    expect(payments.map((p) => p.id)).toEqual([
      's1_2026-11',
      's1_2026-12',
      's1_2027-01',
    ])
    expect(
      payments.every((p) => p.receiptPath === 'receipts/u1/s1/2026-11.jpg')
    ).toBe(true)
    expect(serviceRepository.savePayments).toHaveBeenCalledWith(payments)
  })

  it('getReceiptPreviewUseCase returns a signed URL when receiptPath belongs to userId', async () => {
    const receiptStorage = createMockReceiptStorage()

    const url = await getReceiptPreviewUseCase(
      {
        userId: 'u1',
        receiptPath: 'receipts/u1/s1/2026-11.jpg',
      },
      { receiptStorage }
    )

    expect(url).toBe('https://storage.example.com/signed-receipt.jpg')
    expect(receiptStorage.getReceiptReadUrl).toHaveBeenCalledWith(
      'receipts/u1/s1/2026-11.jpg',
      900
    )
  })

  it('getReceiptPreviewUseCase throws authorization error when receiptPath belongs to another user or contains path traversal', async () => {
    const receiptStorage = createMockReceiptStorage()

    await expect(
      getReceiptPreviewUseCase(
        {
          userId: 'u1',
          receiptPath: 'receipts/u2/s1/2026-11.jpg',
        },
        { receiptStorage }
      )
    ).rejects.toThrow(
      'Forbidden: receipt does not belong to the authenticated user'
    )

    await expect(
      getReceiptPreviewUseCase(
        {
          userId: 'u1',
          receiptPath: 'receipts/u1/../u2/s1/2026-11.jpg',
        },
        { receiptStorage }
      )
    ).rejects.toThrow(
      'Forbidden: receipt does not belong to the authenticated user'
    )

    expect(receiptStorage.getReceiptReadUrl).not.toHaveBeenCalled()
  })

  it('registerPaymentUseCase enforces receipt file policy before calling storage or repository', async () => {
    const serviceRepository = createMockRepository()
    const receiptStorage = createMockReceiptStorage()

    await expect(
      registerPaymentUseCase(
        {
          userId: 'u1',
          serviceId: 's1',
          startPeriod: '2026-11',
          monthsCovered: 1,
          buffer: Buffer.alloc(MAX_RECEIPT_SIZE_BYTES + 1),
          contentType: 'image/jpeg',
        },
        { serviceRepository, receiptStorage }
      )
    ).rejects.toBeInstanceOf(ReceiptPolicyError)

    await expect(
      registerPaymentUseCase(
        {
          userId: 'u1',
          serviceId: 's1',
          startPeriod: '2026-11',
          monthsCovered: 1,
          buffer: Buffer.from('not-an-image'),
          contentType: 'text/plain',
        },
        { serviceRepository, receiptStorage }
      )
    ).rejects.toBeInstanceOf(ReceiptPolicyError)

    expect(serviceRepository.findById).not.toHaveBeenCalled()
    expect(receiptStorage.uploadReceipt).not.toHaveBeenCalled()
    expect(serviceRepository.savePayments).not.toHaveBeenCalled()
  })

  it('registerPaymentUseCase blocks overwriting an existing saved receipt for an already-paid period', async () => {
    const service: Service = {
      id: 's1',
      userId: 'u1',
      name: 'Internet',
      billingDay: 15,
      startPeriod: '2026-11',
      status: 'ACTIVE',
      createdAt: '2026-11-01T00:00:00Z',
    }
    const existingPayment: ServicePayment = {
      id: 's1_2026-11',
      userId: 'u1',
      serviceId: 's1',
      period: '2026-11',
      paidAt: '2026-11-10T00:00:00Z',
      receiptUrl: 'https://storage.example.com/old.jpg',
      receiptType: 'IMAGE',
      receiptPath: 'receipts/u1/s1/2026-11.jpg',
    }
    const serviceRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(service),
      findPaymentsByUserId: vi.fn().mockResolvedValue([existingPayment]),
    })
    const receiptStorage = createMockReceiptStorage()

    await expect(
      registerPaymentUseCase(
        {
          userId: 'u1',
          serviceId: 's1',
          startPeriod: '2026-11',
          monthsCovered: 1,
          buffer: Buffer.from('replacement-image'),
          contentType: 'image/jpeg',
        },
        { serviceRepository, receiptStorage }
      )
    ).rejects.toMatchObject({ code: 'RECEIPT_ALREADY_EXISTS' })

    expect(receiptStorage.uploadReceipt).not.toHaveBeenCalled()
    expect(serviceRepository.savePayments).not.toHaveBeenCalled()
  })

  it('voidServicePaymentUseCase validates reason (3-200 chars), voids atomically without deleting receipt, and reverts service status', async () => {
    const service: Service = {
      id: 's1',
      userId: 'u1',
      name: 'Internet',
      billingDay: 15,
      startPeriod: '2026-10',
      referenceCode: 'INT-{YYYY}-{MM}',
      status: 'ACTIVE',
      createdAt: '2026-10-01T00:00:00Z',
    }
    const existingPayments: ServicePayment[] = [
      {
        id: 's1_2026-10',
        userId: 'u1',
        serviceId: 's1',
        period: '2026-10',
        paidAt: '2026-10-10T00:00:00.000Z',
        receiptUrl: 'https://storage.example.com/2026-10.jpg',
        receiptType: 'IMAGE',
        receiptPath: 'receipts/u1/s1/2026-10.jpg',
        status: 'ACTIVE',
      },
      {
        id: 's1_2026-11',
        userId: 'u1',
        serviceId: 's1',
        period: '2026-11',
        paidAt: '2026-11-10T00:00:00.000Z',
        receiptUrl: 'https://storage.example.com/2026-11.jpg',
        receiptType: 'IMAGE',
        receiptPath: 'receipts/u1/s1/2026-11.jpg',
        status: 'ACTIVE',
      },
    ]

    const serviceRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(service),
      findPaymentsByUserId: vi.fn().mockResolvedValue(existingPayments),
      voidPayment: vi.fn().mockImplementation(async (data) => ({
        ...existingPayments[1],
        status: 'VOIDED' as const,
        voidedAt: data.voidedAt,
        voidReason: data.voidReason,
      })),
    })

    // Reason too short (< 3 chars) fails Zod validation before hitting repo
    await expect(
      voidServicePaymentUseCase(
        {
          userId: 'u1',
          serviceId: 's1',
          paymentId: 's1_2026-11',
          reason: 'no',
        },
        { serviceRepository }
      )
    ).rejects.toBeInstanceOf(ZodError)
    expect(serviceRepository.findById).not.toHaveBeenCalled()

    const result = await voidServicePaymentUseCase(
      {
        userId: 'u1',
        serviceId: 's1',
        paymentId: 's1_2026-11',
        reason: 'Se cargó factura de otro mes',
      },
      {
        serviceRepository,
        now: () => new Date(2026, 10, 12, 14, 0, 0),
      }
    )

    expect(serviceRepository.voidPayment).toHaveBeenCalledWith({
      userId: 'u1',
      serviceId: 's1',
      paymentId: 's1_2026-11',
      voidedAt: new Date(2026, 10, 12, 14, 0, 0).toISOString(),
      voidReason: 'Se cargó factura de otro mes',
      nextPendingPeriod: '2026-11',
      coveredUntilPeriod: '2026-10',
    })
    expect(result.voidedPayment).toMatchObject({
      id: 's1_2026-11',
      status: 'VOIDED',
      receiptPath: 'receipts/u1/s1/2026-11.jpg',
      voidReason: 'Se cargó factura de otro mes',
    })
    expect(result.evaluatedStatus).toEqual({
      statusBadge: 'PENDING',
      nextPendingPeriod: '2026-11',
      coveredUntilPeriod: '2026-10',
      resolvedReferenceCode: 'INT-2026-11',
    })
  })

  it('voidServicePaymentUseCase rejects missing service, archived service, and double voiding', async () => {
    const missingRepo = createMockRepository({
      findById: vi.fn().mockResolvedValue(null),
    })
    await expect(
      voidServicePaymentUseCase(
        {
          userId: 'u1',
          serviceId: 's-missing',
          paymentId: 'p1',
          reason: 'Motivo válido',
        },
        { serviceRepository: missingRepo }
      )
    ).rejects.toBeInstanceOf(ServiceDomainError)

    const service: Service = {
      id: 's1',
      userId: 'u1',
      name: 'Agua',
      billingDay: 10,
      startPeriod: '2026-11',
      status: 'ACTIVE',
      createdAt: '2026-11-01T00:00:00Z',
    }
    const alreadyVoidedRepo = createMockRepository({
      findById: vi.fn().mockResolvedValue(service),
      findPaymentsByUserId: vi.fn().mockResolvedValue([
        {
          id: 's1_2026-11',
          userId: 'u1',
          serviceId: 's1',
          period: '2026-11',
          paidAt: '2026-11-05T00:00:00Z',
          receiptUrl: 'https://storage.example.com/2026-11.jpg',
          receiptType: 'IMAGE',
          receiptPath: 'receipts/u1/s1/2026-11.jpg',
          status: 'VOIDED',
          voidedAt: '2026-11-06T00:00:00Z',
          voidReason: 'Error anterior',
        },
      ]),
    })

    await expect(
      voidServicePaymentUseCase(
        {
          userId: 'u1',
          serviceId: 's1',
          paymentId: 's1_2026-11',
          reason: 'Intento duplicado',
        },
        { serviceRepository: alreadyVoidedRepo }
      )
    ).rejects.toMatchObject({ code: 'PAYMENT_ALREADY_VOIDED' })
    expect(alreadyVoidedRepo.voidPayment).not.toHaveBeenCalled()
  })

  it('voidServicePaymentUseCase rejects voiding a historical active payment when a newer active payment exists', async () => {
    const service: Service = {
      id: 's1',
      userId: 'u1',
      name: 'Internet',
      billingDay: 15,
      startPeriod: '2026-09',
      status: 'ACTIVE',
      createdAt: '2026-09-01T00:00:00Z',
    }
    const payments: ServicePayment[] = [
      {
        id: 's1_2026-09',
        userId: 'u1',
        serviceId: 's1',
        period: '2026-09',
        paidAt: '2026-09-10T00:00:00.000Z',
        receiptUrl: 'https://storage.example.com/2026-09.jpg',
        receiptType: 'IMAGE',
        receiptPath: 'receipts/u1/s1/2026-09.jpg',
        status: 'ACTIVE',
      },
      {
        id: 's1_2026-10',
        userId: 'u1',
        serviceId: 's1',
        period: '2026-10',
        paidAt: '2026-10-10T00:00:00.000Z',
        receiptUrl: 'https://storage.example.com/2026-10.jpg',
        receiptType: 'IMAGE',
        receiptPath: 'receipts/u1/s1/2026-10.jpg',
        status: 'ACTIVE',
      },
      {
        id: 's1_2026-11',
        userId: 'u1',
        serviceId: 's1',
        period: '2026-11',
        paidAt: '2026-11-10T00:00:00.000Z',
        receiptUrl: 'https://storage.example.com/2026-11.jpg',
        receiptType: 'IMAGE',
        receiptPath: 'receipts/u1/s1/2026-11.jpg',
        status: 'ACTIVE',
      },
    ]

    const serviceRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(service),
      findPaymentsByUserId: vi.fn().mockResolvedValue(payments),
    })

    await expect(
      voidServicePaymentUseCase(
        {
          userId: 'u1',
          serviceId: 's1',
          paymentId: 's1_2026-10',
          reason: 'Intento anular mes anterior',
        },
        { serviceRepository }
      )
    ).rejects.toMatchObject({
      code: 'PAYMENT_NOT_LATEST_ACTIVE',
    })

    expect(serviceRepository.voidPayment).not.toHaveBeenCalled()
  })

  it('registerPaymentUseCase allows re-registering a period after its prior payment was VOIDED without overwriting the audit record or storage path', async () => {
    const service: Service = {
      id: 's1',
      userId: 'u1',
      name: 'Internet',
      billingDay: 15,
      startPeriod: '2026-11',
      status: 'ACTIVE',
      createdAt: '2026-11-01T00:00:00Z',
    }
    const voidedPayment: ServicePayment = {
      id: 's1_2026-11',
      userId: 'u1',
      serviceId: 's1',
      period: '2026-11',
      paidAt: '2026-11-05T00:00:00Z',
      receiptUrl: 'https://storage.example.com/old.jpg',
      receiptType: 'IMAGE',
      receiptPath: 'receipts/u1/s1/2026-11.jpg',
      status: 'VOIDED',
      voidedAt: '2026-11-06T00:00:00Z',
      voidReason: 'Comprobante borroso',
    }

    const serviceRepository = createMockRepository({
      findById: vi.fn().mockResolvedValue(service),
      findPaymentsByUserId: vi.fn().mockResolvedValue([voidedPayment]),
    })
    const receiptStorage = createMockReceiptStorage({
      uploadReceipt: vi.fn().mockResolvedValue({
        receiptUrl: 'https://storage.example.com/2026-11_v2.jpg',
        receiptPath: 'receipts/u1/s1/2026-11_v2.jpg',
      }),
    })

    const newPayments = await registerPaymentUseCase(
      {
        userId: 'u1',
        serviceId: 's1',
        startPeriod: '2026-11',
        monthsCovered: 1,
        buffer: Buffer.from('corrected-receipt'),
        contentType: 'image/jpeg',
        extension: 'jpg',
      },
      { serviceRepository, receiptStorage }
    )

    expect(receiptStorage.uploadReceipt).toHaveBeenCalledWith({
      userId: 'u1',
      serviceId: 's1',
      period: '2026-11',
      fileKey: '2026-11_v2',
      buffer: Buffer.from('corrected-receipt'),
      contentType: 'image/jpeg',
      extension: 'jpg',
    })
    expect(newPayments).toHaveLength(1)
    expect(newPayments[0]).toMatchObject({
      id: 's1_2026-11_v2',
      period: '2026-11',
      status: 'ACTIVE',
      receiptPath: 'receipts/u1/s1/2026-11_v2.jpg',
    })
    expect(serviceRepository.savePayments).toHaveBeenCalledWith(newPayments)
  })
})
