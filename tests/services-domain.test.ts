import { describe, expect, it } from 'vitest'

import {
  comparePeriods,
  formatPeriodLabel,
  generatePeriodRange,
  getCurrentPeriod,
  getNextPeriod,
} from '@/core/domain/period'
import {
  isAllowedReceiptMimeType,
  MAX_RECEIPT_SIZE_BYTES,
  ReceiptPolicyError,
  resolveReceiptExtension,
  validateReceiptFile,
} from '@/features/services/domain/receipt.policy'
import { resolveReferenceCode } from '@/features/services/domain/reference-code'
import {
  evaluateServiceStatus,
  getActiveServicePayments,
  getLatestActiveServicePayment,
  getServicePaymentStatus,
  isActiveServicePayment,
  isPaymentEligibleForVoid,
  ServiceDomainError,
  voidPaymentOnService,
  type Service,
  type ServicePayment,
} from '@/features/services/domain/service.entity'
import {
  createServiceSchema,
  registerPaymentSchema,
  updateServiceSchema,
  voidServicePaymentSchema,
} from '@/features/services/domain/service.schemas'

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'srv-1',
    userId: 'user-1',
    name: 'Energía EPM',
    billingDay: 15,
    startPeriod: '2026-10',
    paymentUrl: 'https://facturas.epm.com.co',
    referenceCode: '{YY}{MM}987654',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    ...overrides,
  }
}

function makePayment(
  period: string,
  overrides: Partial<ServicePayment> = {}
): ServicePayment {
  return {
    id: `pay-${period}`,
    userId: 'user-1',
    serviceId: 'srv-1',
    period,
    paidAt: new Date('2026-10-10T10:00:00Z'),
    receiptUrl: 'https://storage.example.com/receipt.pdf',
    receiptType: 'PDF',
    receiptPath: 'receipts/user-1/srv-1/receipt.pdf',
    ...overrides,
  }
}

describe('core/domain/period', () => {
  it('computes current and next period properly', () => {
    expect(getCurrentPeriod(new Date(2026, 10, 18))).toBe('2026-11')
    expect(getNextPeriod('2026-11')).toBe('2026-12')
    expect(getNextPeriod('2026-12')).toBe('2027-01')
  })

  it('generates period ranges crossing year boundaries', () => {
    expect(generatePeriodRange('2026-11', 3)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
    ])
    expect(generatePeriodRange('2026-05', 1)).toEqual(['2026-05'])
  })

  it('compares two periods returning -1, 0, or 1', () => {
    expect(comparePeriods('2026-10', '2026-11')).toBe(-1)
    expect(comparePeriods('2026-11', '2026-11')).toBe(0)
    expect(comparePeriods('2027-01', '2026-12')).toBe(1)
  })

  it('formats period labels in Spanish with capitalized month', () => {
    expect(formatPeriodLabel('2026-11', 'es-CO')).toBe('Noviembre 2026')
    expect(formatPeriodLabel('2027-01', 'es-CO')).toBe('Enero 2027')
  })
})

describe('features/services/domain/reference-code', () => {
  it('replaces {YY}{MM} dynamic tokens keeping fixed text', () => {
    expect(resolveReferenceCode('{YY}{MM}987654', '2026-11')).toBe('2611987654')
  })

  it('replaces {YYYY}-{MM} dynamic tokens', () => {
    expect(resolveReferenceCode('FAC-{YYYY}-{MM}-A', '2027-01')).toBe(
      'FAC-2027-01-A'
    )
  })

  it('keeps fixed codes unchanged and returns empty string for undefined', () => {
    expect(resolveReferenceCode('REF-FIJA-12345', '2026-11')).toBe(
      'REF-FIJA-12345'
    )
    expect(resolveReferenceCode(undefined, '2026-11')).toBe('')
  })
})

describe('features/services/domain/service.entity - evaluateServiceStatus', () => {
  it('returns UP_TO_DATE for a newly created service with a future startPeriod', () => {
    const service = makeService({
      startPeriod: '2026-12',
      referenceCode: '{YY}{MM}987654',
    })
    const result = evaluateServiceStatus(
      service,
      [],
      new Date(2026, 10, 18) // 2026-11-18
    )

    expect(result).toEqual({
      statusBadge: 'UP_TO_DATE',
      nextPendingPeriod: '2026-12',
      coveredUntilPeriod: null,
      resolvedReferenceCode: '2612987654',
    })
  })

  it('returns PENDING when current period is unpaid and today is on or before billingDay', () => {
    const service = makeService({
      startPeriod: '2026-11',
      billingDay: 15,
    })
    const result = evaluateServiceStatus(
      service,
      [],
      new Date(2026, 10, 12) // 2026-11-12 <= 15
    )

    expect(result).toEqual({
      statusBadge: 'PENDING',
      nextPendingPeriod: '2026-11',
      coveredUntilPeriod: null,
      resolvedReferenceCode: '2611987654',
    })
  })

  it('returns OVERDUE when current period is unpaid and today is after billingDay', () => {
    const service = makeService({
      startPeriod: '2026-11',
      billingDay: 15,
    })
    const result = evaluateServiceStatus(
      service,
      [],
      new Date(2026, 10, 18) // 2026-11-18 > 15
    )

    expect(result).toEqual({
      statusBadge: 'OVERDUE',
      nextPendingPeriod: '2026-11',
      coveredUntilPeriod: null,
      resolvedReferenceCode: '2611987654',
    })
  })

  it('returns UP_TO_DATE when paid 3 months in advance', () => {
    const service = makeService({
      startPeriod: '2026-11',
      billingDay: 10,
      referenceCode: '{YYYY}-{MM}',
    })
    const payments = [
      makePayment('2026-11'),
      makePayment('2026-12'),
      makePayment('2027-01'),
    ]

    const result = evaluateServiceStatus(
      service,
      payments,
      new Date(2026, 10, 25) // 2026-11-25
    )

    expect(result).toEqual({
      statusBadge: 'UP_TO_DATE',
      nextPendingPeriod: '2027-02',
      coveredUntilPeriod: '2027-01',
      resolvedReferenceCode: '2027-02',
    })
  })

  it('returns ARCHIVED when service status is ARCHIVED regardless of payments', () => {
    const service = makeService({
      startPeriod: '2026-09',
      status: 'ARCHIVED',
    })
    const result = evaluateServiceStatus(
      service,
      [makePayment('2026-09')],
      new Date(2026, 10, 18)
    )

    expect(result).toEqual({
      statusBadge: 'ARCHIVED',
      nextPendingPeriod: '2026-10',
      coveredUntilPeriod: '2026-09',
      resolvedReferenceCode: '2610987654',
    })
  })

  it('treats legacy payments without status as ACTIVE and ignores VOIDED payments', () => {
    const legacyPayment = makePayment('2026-10')
    delete legacyPayment.status

    const voidedPayment = makePayment('2026-11', {
      status: 'VOIDED',
      voidedAt: '2026-11-12T10:00:00.000Z',
      voidReason: 'Comprobante incorrecto',
    })

    expect(getServicePaymentStatus(legacyPayment)).toBe('ACTIVE')
    expect(isActiveServicePayment(legacyPayment)).toBe(true)
    expect(getServicePaymentStatus(voidedPayment)).toBe('VOIDED')
    expect(isActiveServicePayment(voidedPayment)).toBe(false)
    expect(getActiveServicePayments([legacyPayment, voidedPayment])).toEqual([
      legacyPayment,
    ])

    const service = makeService({
      startPeriod: '2026-10',
      billingDay: 20,
      referenceCode: '{YY}{MM}987654',
    })

    const evaluated = evaluateServiceStatus(
      service,
      [legacyPayment, voidedPayment],
      new Date(2026, 10, 15) // 2026-11-15 <= 20
    )

    expect(evaluated).toEqual({
      statusBadge: 'PENDING',
      nextPendingPeriod: '2026-11',
      coveredUntilPeriod: '2026-10',
      resolvedReferenceCode: '2611987654',
    })
  })
})

describe('features/services/domain/service.entity - voidPaymentOnService', () => {
  it('reverts a single-payment service back to PENDING (or OVERDUE after billingDay) while preserving receipt metadata', () => {
    const service = makeService({
      startPeriod: '2026-11',
      billingDay: 15,
      referenceCode: 'REF-{YYYY}-{MM}',
    })
    const singlePayment = makePayment('2026-11', {
      id: 'srv-1_2026-11',
      receiptPath: 'receipts/user-1/srv-1/2026-11.webp',
    })

    const beforeVoid = evaluateServiceStatus(
      service,
      [singlePayment],
      new Date(2026, 10, 10)
    )
    expect(beforeVoid.statusBadge).toBe('UP_TO_DATE')
    expect(beforeVoid.nextPendingPeriod).toBe('2026-12')

    // On or before billingDay -> reverts to PENDING
    const pendingResult = voidPaymentOnService(
      service,
      [singlePayment],
      'srv-1_2026-11',
      'Se subió recibo de otro mes',
      '2026-11-10T15:00:00.000Z',
      new Date(2026, 10, 10)
    )

    expect(pendingResult.voidedPayment).toMatchObject({
      id: 'srv-1_2026-11',
      status: 'VOIDED',
      voidedAt: '2026-11-10T15:00:00.000Z',
      voidReason: 'Se subió recibo de otro mes',
      receiptPath: 'receipts/user-1/srv-1/2026-11.webp',
      receiptUrl: singlePayment.receiptUrl,
    })
    expect(pendingResult.activePaymentsCount).toBe(0)
    expect(pendingResult.evaluatedStatus).toEqual({
      statusBadge: 'PENDING',
      nextPendingPeriod: '2026-11',
      coveredUntilPeriod: null,
      resolvedReferenceCode: 'REF-2026-11',
    })

    // After billingDay -> reverts to OVERDUE
    const overdueResult = voidPaymentOnService(
      service,
      [singlePayment],
      'srv-1_2026-11',
      'Se subió recibo de otro mes',
      '2026-11-20T15:00:00.000Z',
      new Date(2026, 10, 20)
    )
    expect(overdueResult.evaluatedStatus.statusBadge).toBe('OVERDUE')
    expect(overdueResult.evaluatedStatus.nextPendingPeriod).toBe('2026-11')
  })

  it('reverts a recurring service to the previous billing cycle when voiding its latest active payment', () => {
    const service = makeService({
      startPeriod: '2026-09',
      billingDay: 20,
      referenceCode: '{YY}{MM}987654',
    })
    const payments = [
      makePayment('2026-09', { id: 'srv-1_2026-09', status: 'ACTIVE' }),
      makePayment('2026-10', { id: 'srv-1_2026-10', status: 'ACTIVE' }),
      makePayment('2026-11', { id: 'srv-1_2026-11', status: 'ACTIVE' }),
    ]

    const beforeVoid = evaluateServiceStatus(
      service,
      payments,
      new Date(2026, 10, 15)
    )
    expect(beforeVoid).toEqual({
      statusBadge: 'UP_TO_DATE',
      nextPendingPeriod: '2026-12',
      coveredUntilPeriod: '2026-11',
      resolvedReferenceCode: '2612987654',
    })

    const result = voidPaymentOnService(
      service,
      payments,
      'srv-1_2026-11',
      'Pago duplicado',
      '2026-11-15T12:00:00.000Z',
      new Date(2026, 10, 15)
    )

    expect(result.activePaymentsCount).toBe(2)
    expect(result.evaluatedStatus).toEqual({
      statusBadge: 'PENDING',
      nextPendingPeriod: '2026-11',
      coveredUntilPeriod: '2026-10',
      resolvedReferenceCode: '2611987654',
    })
  })

  it('reverts nextPendingPeriod while remaining UP_TO_DATE when voiding an advance future cycle', () => {
    const service = makeService({
      startPeriod: '2026-11',
      billingDay: 15,
    })
    const payments = [
      makePayment('2026-11', { id: 'srv-1_2026-11', status: 'ACTIVE' }),
      makePayment('2026-12', { id: 'srv-1_2026-12', status: 'ACTIVE' }),
    ]

    const result = voidPaymentOnService(
      service,
      payments,
      'srv-1_2026-12',
      'Solo se pagó noviembre',
      '2026-11-10T10:00:00.000Z',
      new Date(2026, 10, 10)
    )

    expect(result.evaluatedStatus).toEqual({
      statusBadge: 'UP_TO_DATE',
      nextPendingPeriod: '2026-12',
      coveredUntilPeriod: '2026-11',
      resolvedReferenceCode: '2612987654',
    })
  })

  it('rejects double voiding, unknown payments, and archived services', () => {
    const activeService = makeService()
    const archivedService = makeService({ status: 'ARCHIVED' })
    const alreadyVoided = makePayment('2026-10', {
      id: 'srv-1_2026-10',
      status: 'VOIDED',
      voidReason: 'Anulado previamente',
    })

    expect(() =>
      voidPaymentOnService(
        archivedService,
        [makePayment('2026-10', { id: 'srv-1_2026-10' })],
        'srv-1_2026-10',
        'Motivo válido',
        '2026-11-01T00:00:00.000Z'
      )
    ).toThrow(ServiceDomainError)

    expect(() =>
      voidPaymentOnService(
        activeService,
        [alreadyVoided],
        'srv-1_2026-10',
        'Segundo intento',
        '2026-11-01T00:00:00.000Z'
      )
    ).toThrow(/already voided/i)

    expect(() =>
      voidPaymentOnService(
        activeService,
        [makePayment('2026-10', { id: 'other-id', serviceId: 'srv-other' })],
        'other-id',
        'Motivo válido',
        '2026-11-01T00:00:00.000Z'
      )
    ).toThrow(/not found/i)
  })

  it('allows voiding ONLY the chronologically latest ACTIVE payment and rejects earlier active payments', () => {
    const service = makeService({
      startPeriod: '2026-09',
      billingDay: 20,
    })
    const archivedService = makeService({ status: 'ARCHIVED' })

    const sep = makePayment('2026-09', {
      id: 'srv-1_2026-09',
      status: 'ACTIVE',
    })
    const oct = makePayment('2026-10', {
      id: 'srv-1_2026-10',
      status: 'ACTIVE',
    })
    const nov = makePayment('2026-11', {
      id: 'srv-1_2026-11',
      status: 'ACTIVE',
    })
    const decVoided = makePayment('2026-12', {
      id: 'srv-1_2026-12',
      status: 'VOIDED',
      voidedAt: '2026-11-18T10:00:00.000Z',
      voidReason: 'Adelanto anulado',
    })

    const payments = [sep, oct, nov, decVoided]

    // Latest active ignores VOIDED 2026-12 and resolves to 2026-11
    expect(getLatestActiveServicePayment('srv-1', payments)?.id).toBe(
      'srv-1_2026-11'
    )
    expect(isPaymentEligibleForVoid(service, payments, 'srv-1_2026-11')).toBe(
      true
    )
    expect(isPaymentEligibleForVoid(service, payments, 'srv-1_2026-10')).toBe(
      false
    )
    expect(isPaymentEligibleForVoid(service, payments, 'srv-1_2026-09')).toBe(
      false
    )
    expect(isPaymentEligibleForVoid(service, payments, 'srv-1_2026-12')).toBe(
      false
    )
    expect(
      isPaymentEligibleForVoid(archivedService, payments, 'srv-1_2026-11')
    ).toBe(false)

    // Attempting to void historical active payment 2026-10 must fail cleanly
    expect(() =>
      voidPaymentOnService(
        service,
        payments,
        'srv-1_2026-10',
        'Intento sobre pago anterior',
        '2026-11-19T10:00:00.000Z',
        new Date(2026, 10, 19)
      )
    ).toThrow(ServiceDomainError)

    try {
      voidPaymentOnService(
        service,
        payments,
        'srv-1_2026-10',
        'Intento sobre pago anterior',
        '2026-11-19T10:00:00.000Z',
        new Date(2026, 10, 19)
      )
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceDomainError)
      expect((error as ServiceDomainError).code).toBe(
        'PAYMENT_NOT_LATEST_ACTIVE'
      )
    }

    // Voiding 2026-11 (latest active despite voided 2026-12) succeeds
    const voidedNov = voidPaymentOnService(
      service,
      payments,
      'srv-1_2026-11',
      'Corrección de noviembre',
      '2026-11-19T10:00:00.000Z',
      new Date(2026, 10, 19)
    )
    expect(voidedNov.evaluatedStatus.nextPendingPeriod).toBe('2026-11')
    expect(voidedNov.evaluatedStatus.coveredUntilPeriod).toBe('2026-10')
    expect(voidedNov.evaluatedStatus.statusBadge).toBe('PENDING')

    // After voiding 2026-11, 2026-10 becomes the new latest active payment
    expect(
      isPaymentEligibleForVoid(service, voidedNov.payments, 'srv-1_2026-10')
    ).toBe(true)
  })
})

describe('features/services/domain/service.schemas', () => {
  it('validates createServiceSchema, updateServiceSchema and registerPaymentSchema', () => {
    const validService = createServiceSchema.parse({
      name: 'Internet Fibra',
      billingDay: 20,
      startPeriod: '2026-11',
      paymentUrl: '',
      referenceCode: '{YY}{MM}111',
    })
    expect(validService.billingDay).toBe(20)

    expect(() =>
      createServiceSchema.parse({
        name: 'Internet',
        billingDay: 32,
        startPeriod: '2026-13',
      })
    ).toThrow()

    const updated = updateServiceSchema.parse({ status: 'ARCHIVED' })
    expect(updated.status).toBe('ARCHIVED')

    const payment = registerPaymentSchema.parse({
      serviceId: 'srv-1',
    })
    expect(payment.monthsCovered).toBe(1)

    const validVoid = voidServicePaymentSchema.parse({
      serviceId: 'srv-1',
      paymentId: 'srv-1_2026-11',
      reason: '  Error de comprobante  ',
    })
    expect(validVoid.reason).toBe('Error de comprobante')

    expect(() =>
      voidServicePaymentSchema.parse({
        serviceId: 'srv-1',
        paymentId: 'srv-1_2026-11',
        reason: 'ab',
      })
    ).toThrow()

    expect(() =>
      voidServicePaymentSchema.parse({
        serviceId: 'srv-1',
        paymentId: 'srv-1_2026-11',
        reason: 'x'.repeat(201),
      })
    ).toThrow()
  })
})

describe('features/services/domain/receipt.policy', () => {
  it('allows only image/jpeg, image/png, image/webp, and application/pdf MIME types', () => {
    expect(isAllowedReceiptMimeType('image/jpeg')).toBe(true)
    expect(isAllowedReceiptMimeType('image/png')).toBe(true)
    expect(isAllowedReceiptMimeType('image/webp')).toBe(true)
    expect(isAllowedReceiptMimeType('application/pdf')).toBe(true)
    expect(isAllowedReceiptMimeType('image/heic')).toBe(false)
    expect(isAllowedReceiptMimeType('image/heif')).toBe(false)
    expect(isAllowedReceiptMimeType('image/gif')).toBe(false)
    expect(isAllowedReceiptMimeType('image/svg+xml')).toBe(false)
    expect(isAllowedReceiptMimeType('text/html')).toBe(false)
    expect(isAllowedReceiptMimeType('application/javascript')).toBe(false)
    expect(isAllowedReceiptMimeType('')).toBe(false)
  })

  it('normalizes and resolves receipt extensions safely', () => {
    expect(resolveReceiptExtension('application/pdf', 'doc.PDF')).toBe('pdf')
    expect(resolveReceiptExtension('image/jpeg', 'photo.PNG')).toBe('jpg')
    expect(resolveReceiptExtension('image/webp', 'photo.webp')).toBe('webp')
    expect(resolveReceiptExtension('image/avif', 'photo.avif')).toBe('avif')
    expect(resolveReceiptExtension('image/custom', 'bad..name', '.HEIF')).toBe(
      'heif'
    )
  })

  it('validates valid image and PDF receipts', () => {
    expect(
      validateReceiptFile({
        sizeBytes: 1024,
        contentType: 'image/png',
        fileName: 'receipt.png',
      })
    ).toEqual({
      contentType: 'image/png',
      extension: 'png',
      receiptType: 'IMAGE',
    })

    expect(
      validateReceiptFile({
        sizeBytes: MAX_RECEIPT_SIZE_BYTES,
        contentType: 'application/pdf',
        fileName: 'factura.pdf',
      })
    ).toEqual({
      contentType: 'application/pdf',
      extension: 'pdf',
      receiptType: 'PDF',
    })
  })

  it('rejects empty files, files larger than 5 MB, and unsupported MIME types', () => {
    expect(() =>
      validateReceiptFile({
        sizeBytes: 0,
        contentType: 'image/jpeg',
      })
    ).toThrow(ReceiptPolicyError)

    expect(() =>
      validateReceiptFile({
        sizeBytes: MAX_RECEIPT_SIZE_BYTES + 1,
        contentType: 'image/jpeg',
      })
    ).toThrow(/exceeds maximum size/i)

    expect(() =>
      validateReceiptFile({
        sizeBytes: 1024,
        contentType: 'application/zip',
      })
    ).toThrow(/unsupported receipt mime type/i)
  })
})
