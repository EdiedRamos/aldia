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
  type Service,
  type ServicePayment,
} from '@/features/services/domain/service.entity'
import {
  createServiceSchema,
  registerPaymentSchema,
  updateServiceSchema,
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
  })
})

describe('features/services/domain/receipt.policy', () => {
  it('allows image/* and application/pdf MIME types and rejects others', () => {
    expect(isAllowedReceiptMimeType('image/jpeg')).toBe(true)
    expect(isAllowedReceiptMimeType('image/png')).toBe(true)
    expect(isAllowedReceiptMimeType('application/pdf')).toBe(true)
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
