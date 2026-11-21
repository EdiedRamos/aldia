import { describe, expect, it, vi } from 'vitest'

import { getWhatsAppTemplatesUseCase } from '@/features/loans/application/get-whatsapp-templates.use-case'
import { updateWhatsAppTemplatesUseCase } from '@/features/loans/application/update-whatsapp-templates.use-case'
import {
  buildLoanReminderMessage,
  buildLoanWhatsAppUrl,
  getLoanTotals,
  LoanDomainError,
  type Loan,
} from '@/features/loans/domain/loan.entity'
import {
  buildLoanReceiptPath,
  isAllowedLoanReceiptMimeType,
  isOwnedLoanReceiptPath,
  LoanReceiptPolicyError,
  MAX_LOAN_RECEIPT_SIZE_BYTES,
  resolveLoanReceiptExtension,
  resolveLoanReceiptTypeFromPath,
  validateLoanReceiptFile,
} from '@/features/loans/domain/loan.policy'
import type { ILoanSettingsRepository } from '@/features/loans/domain/loan.repository'
import {
  createLoanSchema,
  refinanceLoanSchema,
  registerLoanPaymentSchema,
  updateInstallmentSchema,
  voidLoanPaymentSchema,
  whatsAppTemplatesSchema,
} from '@/features/loans/domain/loan.schemas'
import {
  buildTemplatedLoanWhatsAppUrl,
  buildWhatsAppSendUrl,
  DEFAULT_DIRECT_LOAN_TEMPLATE,
  DEFAULT_THIRD_PARTY_LOAN_TEMPLATE,
  DEFAULT_WHATSAPP_TEMPLATES,
  renderWhatsAppLoanMessage,
} from '@/features/loans/domain/loan-whatsapp-template'
import {
  addMonthsToIsoDate,
  applyInstallmentUpdate,
  applyPaymentToLoan,
  buildScheduleFromCustomInstallments,
  calculateLoanSchedule,
  diffCalendarDays,
  evaluateLoanEffectiveStatus,
  getOpenEndedCurrentInterestDue,
  isValidIsoDate,
  recalculateLoanStateFromPayments,
  requiresLoanReminder,
  voidPaymentOnLoan,
} from '@/features/loans/domain/loan-schedule.calculator'

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    userId: 'user-1',
    contactId: 'contact-1',
    direction: 'LENT',
    principalAmount: 300000,
    interestRate: 10,
    interestModel: 'DECLINING_BALANCE',
    totalPrincipalDue: 300000,
    totalInterestDue: 60000,
    paidPrincipal: 0,
    paidInterest: 0,
    installments: [
      {
        installmentNumber: 1,
        dueDate: '2026-11-10',
        principalDue: 100000,
        interestDue: 30000,
        lateFeeDue: 0,
        paidAmount: 0,
        status: 'PENDING',
      },
      {
        installmentNumber: 2,
        dueDate: '2026-12-10',
        principalDue: 100000,
        interestDue: 20000,
        lateFeeDue: 0,
        paidAmount: 0,
        status: 'PENDING',
      },
      {
        installmentNumber: 3,
        dueDate: '2027-01-10',
        principalDue: 100000,
        interestDue: 10000,
        lateFeeDue: 0,
        paidAmount: 0,
        status: 'PENDING',
      },
    ],
    payments: [],
    disbursementDate: '2026-10-10',
    disbursementReceiptPath: null,
    monthlyBillingDay: null,
    nextInterestDueDate: null,
    status: 'ACTIVE',
    parentLoanId: null,
    notes: null,
    createdAt: '2026-10-10T12:00:00.000Z',
    updatedAt: '2026-10-10T12:00:00.000Z',
    ...overrides,
  }
}

describe('features/loans/domain/loan-schedule.calculator - 5 interest models', () => {
  it('calculates OPEN_ENDED model with 0% interest (silent, no billing day/date, no installments)', () => {
    const schedule = calculateLoanSchedule({
      principalAmount: 250000,
      interestRate: 0,
      interestModel: 'OPEN_ENDED',
      disbursementDate: '2026-11-20',
      installmentCount: 5,
    })

    expect(schedule).toEqual({
      interestRate: 0,
      totalPrincipalDue: 250000,
      totalInterestDue: 0,
      installments: [],
      monthlyBillingDay: null,
      nextInterestDueDate: null,
    })
  })

  it('calculates OPEN_ENDED model with fixed monthly interest (> 0%), billing day, and nextInterestDueDate', () => {
    const schedule = calculateLoanSchedule({
      principalAmount: 1000000,
      interestRate: 8,
      interestModel: 'OPEN_ENDED',
      disbursementDate: '2026-11-20',
    })

    expect(schedule).toEqual({
      interestRate: 8,
      totalPrincipalDue: 1000000,
      totalInterestDue: 80000,
      installments: [],
      monthlyBillingDay: 20,
      nextInterestDueDate: '2026-12-20',
    })

    // Custom billing day
    const customDay = calculateLoanSchedule({
      principalAmount: 1000000,
      interestRate: 8,
      interestModel: 'OPEN_ENDED',
      disbursementDate: '2026-01-31',
      monthlyBillingDay: 31,
    })
    expect(customDay.monthlyBillingDay).toBe(31)
    expect(customDay.nextInterestDueDate).toBe('2026-02-28')
  })

  it('calculates NO_INTEREST model across N installments with manual dates and exact rounding remainder', () => {
    const schedule = calculateLoanSchedule({
      principalAmount: 100,
      interestRate: 10, // must be forced to 0
      interestModel: 'NO_INTEREST',
      disbursementDate: '2026-11-01',
      installmentCount: 3,
      dueDates: ['2026-11-15', '2026-12-01', '2026-12-20'],
    })

    expect(schedule.interestRate).toBe(0)
    expect(schedule.totalPrincipalDue).toBe(100)
    expect(schedule.totalInterestDue).toBe(0)
    expect(schedule.installments).toEqual([
      {
        installmentNumber: 1,
        dueDate: '2026-11-15',
        principalDue: 33.33,
        interestDue: 0,
        lateFeeDue: 0,
        paidAmount: 0,
        status: 'PENDING',
      },
      {
        installmentNumber: 2,
        dueDate: '2026-12-01',
        principalDue: 33.33,
        interestDue: 0,
        lateFeeDue: 0,
        paidAmount: 0,
        status: 'PENDING',
      },
      {
        installmentNumber: 3,
        dueDate: '2026-12-20',
        principalDue: 33.34,
        interestDue: 0,
        lateFeeDue: 0,
        paidAmount: 0,
        status: 'PENDING',
      },
    ])
  })

  it('calculates SINGLE_PAYMENT model with principal + interest on manual due date', () => {
    const schedule = calculateLoanSchedule({
      principalAmount: 500000,
      interestRate: 8,
      interestModel: 'SINGLE_PAYMENT',
      disbursementDate: '2026-11-01',
      dueDates: ['2026-12-15'],
    })

    expect(schedule.totalPrincipalDue).toBe(500000)
    expect(schedule.totalInterestDue).toBe(40000)
    expect(schedule.installments).toHaveLength(1)
    expect(schedule.installments[0]).toMatchObject({
      installmentNumber: 1,
      dueDate: '2026-12-15',
      principalDue: 500000,
      interestDue: 40000,
      status: 'PENDING',
    })
  })

  it('calculates INTEREST_ONLY_BALLOON model with periodic interest and principal on final installment', () => {
    const schedule = calculateLoanSchedule({
      principalAmount: 1000000,
      interestRate: 5,
      interestModel: 'INTEREST_ONLY_BALLOON',
      disbursementDate: '2026-11-01',
      installmentCount: 3,
      dueDates: ['2026-12-01', '2027-01-01', '2027-02-01'],
    })

    expect(schedule.totalPrincipalDue).toBe(1000000)
    expect(schedule.totalInterestDue).toBe(150000)
    expect(schedule.installments.map((i) => i.principalDue)).toEqual([
      0, 0, 1000000,
    ])
    expect(schedule.installments.map((i) => i.interestDue)).toEqual([
      50000, 50000, 50000,
    ])
    expect(schedule.installments.map((i) => i.dueDate)).toEqual([
      '2026-12-01',
      '2027-01-01',
      '2027-02-01',
    ])
  })

  it('calculates DECLINING_BALANCE model with fixed principal and interest on remaining live balance', () => {
    const schedule = calculateLoanSchedule({
      principalAmount: 400000,
      interestRate: 10,
      interestModel: 'DECLINING_BALANCE',
      disbursementDate: '2026-11-01',
      installmentCount: 4,
      dueDates: ['2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01'],
    })

    expect(schedule.totalPrincipalDue).toBe(400000)
    // Balance progression: 400k (40k int) -> 300k (30k int) -> 200k (20k int) -> 100k (10k int) = 100k total interest
    expect(schedule.totalInterestDue).toBe(100000)
    expect(schedule.installments.map((i) => i.principalDue)).toEqual([
      100000, 100000, 100000, 100000,
    ])
    expect(schedule.installments.map((i) => i.interestDue)).toEqual([
      40000, 30000, 20000, 10000,
    ])
  })

  it('supports manual editing of installment dates and amounts via buildScheduleFromCustomInstallments', () => {
    const custom = buildScheduleFromCustomInstallments('DECLINING_BALANCE', 5, [
      { dueDate: '2026-11-28', principalDue: 150000, interestDue: 12000 },
      { dueDate: '2026-12-28', principalDue: 250000, interestDue: 8000 },
    ])

    expect(custom.totalPrincipalDue).toBe(400000)
    expect(custom.totalInterestDue).toBe(20000)
    expect(custom.installments[0]).toMatchObject({
      installmentNumber: 1,
      dueDate: '2026-11-28',
      principalDue: 150000,
      interestDue: 12000,
    })
    expect(custom.installments[1]).toMatchObject({
      installmentNumber: 2,
      dueDate: '2026-12-28',
      principalDue: 250000,
      interestDue: 8000,
    })

    expect(() =>
      buildScheduleFromCustomInstallments('OPEN_ENDED', 0, [
        { dueDate: '2026-12-01', principalDue: 1000, interestDue: 0 },
      ])
    ).toThrow(LoanDomainError)
  })

  it('clamps end-of-month dates accurately and validates calendar dates', () => {
    expect(addMonthsToIsoDate('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsToIsoDate('2024-01-31', 1)).toBe('2024-02-29')
    expect(isValidIsoDate('2026-02-29')).toBe(false)
    expect(isValidIsoDate('2024-02-29')).toBe(true)
    expect(diffCalendarDays('2026-11-10', '2026-11-20')).toBe(10)
  })
})

describe('features/loans/domain/loan-schedule.calculator - real-time status & overdue detection', () => {
  it('marks scheduled active loan as OVERDUE with exact overdue days when dueDate < today', () => {
    const loan = makeLoan()
    const status = evaluateLoanEffectiveStatus(loan, '2026-11-20')

    expect(status.effectiveStatus).toBe('OVERDUE')
    expect(status.isOverdue).toBe(true)
    expect(status.overdueDays).toBe(10)
    expect(status.overdueInstallmentsCount).toBe(1)
    expect(status.nextInstallment?.installmentNumber).toBe(1)
  })

  it('marks scheduled active loan as ACTIVE on exact due date or before due date', () => {
    const loan = makeLoan()

    const onDueDate = evaluateLoanEffectiveStatus(loan, '2026-11-10')
    expect(onDueDate.effectiveStatus).toBe('ACTIVE')
    expect(onDueDate.isOverdue).toBe(false)
    expect(onDueDate.overdueDays).toBe(0)

    const beforeDueDate = evaluateLoanEffectiveStatus(loan, '2026-11-01')
    expect(beforeDueDate.effectiveStatus).toBe('ACTIVE')
    expect(beforeDueDate.isOverdue).toBe(false)
  })

  it('NEVER marks OPEN_ENDED loans as OVERDUE regardless of elapsed time', () => {
    const openEndedLoan = makeLoan({
      interestModel: 'OPEN_ENDED',
      interestRate: 0,
      totalPrincipalDue: 200000,
      totalInterestDue: 0,
      installments: [],
      disbursementDate: '2020-01-01',
    })

    const status = evaluateLoanEffectiveStatus(openEndedLoan, '2026-11-20')

    expect(status.effectiveStatus).toBe('OPEN_ENDED')
    expect(status.isOverdue).toBe(false)
    expect(status.overdueDays).toBe(0)
    expect(status.nextInstallment).toBeNull()
  })

  it('preserves terminal statuses PAID, REFINANCED, and ARCHIVED', () => {
    expect(
      evaluateLoanEffectiveStatus(makeLoan({ status: 'PAID' }), '2028-01-01')
        .effectiveStatus
    ).toBe('PAID')
    expect(
      evaluateLoanEffectiveStatus(
        makeLoan({ status: 'REFINANCED' }),
        '2028-01-01'
      ).effectiveStatus
    ).toBe('REFINANCED')
    expect(
      evaluateLoanEffectiveStatus(
        makeLoan({ status: 'ARCHIVED' }),
        '2028-01-01'
      ).effectiveStatus
    ).toBe('ARCHIVED')
  })
})

describe('features/loans/domain/loan-schedule.calculator - payment imputation & installment updates', () => {
  it('allocates partial payments in waterfall order (lateFee -> interest -> principal) and spills across installments', () => {
    const loanWithLateFee = makeLoan({
      installments: [
        {
          installmentNumber: 1,
          dueDate: '2026-11-10',
          principalDue: 100000,
          interestDue: 30000,
          lateFeeDue: 10000,
          paidAmount: 0,
          status: 'PENDING',
        },
        {
          installmentNumber: 2,
          dueDate: '2026-12-10',
          principalDue: 100000,
          interestDue: 20000,
          lateFeeDue: 0,
          paidAmount: 0,
          status: 'PENDING',
        },
        {
          installmentNumber: 3,
          dueDate: '2027-01-10',
          principalDue: 100000,
          interestDue: 10000,
          lateFeeDue: 0,
          paidAmount: 0,
          status: 'PENDING',
        },
      ],
    })

    // First partial payment of 50,000 -> covers 10,000 lateFee + 30,000 interest + 10,000 principal on inst #1
    const first = applyPaymentToLoan(loanWithLateFee, 50000, {
      id: 'pay-1',
      paidAt: '2026-11-15T10:00:00.000Z',
      receiptPath: null,
      notes: 'Abono parcial',
    })

    expect(first.payment).toMatchObject({
      amount: 50000,
      lateFeeApplied: 10000,
      interestApplied: 30000,
      principalApplied: 10000,
    })
    expect(first.installments[0]).toMatchObject({
      paidAmount: 50000,
      status: 'PARTIAL',
    })
    expect(first.status).toBe('ACTIVE')

    const afterFirst: Loan = {
      ...loanWithLateFee,
      installments: first.installments,
      payments: first.payments,
      paidPrincipal: first.paidPrincipal,
      paidInterest: first.paidInterest,
      status: first.status,
    }

    // Second payment of 120,000 -> finishes inst #1 (90,000 principal) + covers inst #2 (20,000 interest + 10,000 principal)
    const second = applyPaymentToLoan(afterFirst, 120000, {
      id: 'pay-2',
      paidAt: '2026-11-20T10:00:00.000Z',
      receiptPath: 'loans/user-1/loan-1/payment-pay-2.jpg',
      notes: null,
    })

    expect(second.payment).toMatchObject({
      amount: 120000,
      lateFeeApplied: 0,
      interestApplied: 20000,
      principalApplied: 100000,
    })
    expect(second.installments[0].status).toBe('PAID')
    expect(second.installments[1]).toMatchObject({
      paidAmount: 30000,
      status: 'PARTIAL',
    })

    // Final payment settles exact remaining balance (90k inst #2 + 110k inst #3 = 200k)
    const afterSecond: Loan = {
      ...afterFirst,
      installments: second.installments,
      payments: second.payments,
      paidPrincipal: second.paidPrincipal,
      paidInterest: second.paidInterest,
      status: second.status,
    }

    const totalsBeforeFinal = getLoanTotals(afterSecond)
    expect(totalsBeforeFinal.remainingTotal).toBe(200000)

    const final = applyPaymentToLoan(afterSecond, 200000, {
      id: 'pay-3',
      paidAt: '2026-12-01T10:00:00.000Z',
      receiptPath: null,
      notes: 'Saldo final',
    })

    expect(final.status).toBe('PAID')
    expect(final.paidPrincipal).toBe(300000)
    expect(final.paidInterest).toBe(60000)
    expect(final.installments.every((i) => i.status === 'PAID')).toBe(true)
  })

  it('deducts OPEN_ENDED payments directly from paidPrincipal and marks PAID at 0', () => {
    const openLoan = makeLoan({
      interestModel: 'OPEN_ENDED',
      principalAmount: 150000,
      totalPrincipalDue: 150000,
      totalInterestDue: 0,
      interestRate: 0,
      installments: [],
    })

    const first = applyPaymentToLoan(openLoan, 60000, {
      id: 'pay-open-1',
      paidAt: '2026-11-10T10:00:00.000Z',
      receiptPath: null,
      notes: null,
    })

    expect(first.paidPrincipal).toBe(60000)
    expect(first.status).toBe('ACTIVE')

    const second = applyPaymentToLoan({ ...openLoan, ...first }, 90000, {
      id: 'pay-open-2',
      paidAt: '2026-11-20T10:00:00.000Z',
      receiptPath: null,
      notes: null,
    })

    expect(second.paidPrincipal).toBe(150000)
    expect(second.status).toBe('PAID')
  })

  it('rejects payments exceeding remaining balance or on non-active loans', () => {
    const loan = makeLoan()
    expect(() =>
      applyPaymentToLoan(loan, 500000, {
        id: 'pay-excess',
        paidAt: '2026-11-20T10:00:00.000Z',
        receiptPath: null,
        notes: null,
      })
    ).toThrow(LoanDomainError)

    expect(() =>
      applyPaymentToLoan(makeLoan({ status: 'PAID' }), 10000, {
        id: 'pay-paid',
        paidAt: '2026-11-20T10:00:00.000Z',
        receiptPath: null,
        notes: null,
      })
    ).toThrow(LoanDomainError)
  })

  it('updates dueDate and lateFeeDue on pending installments and blocks PAID or OPEN_ENDED', () => {
    const loan = makeLoan()
    const updated = applyInstallmentUpdate(loan, 1, {
      dueDate: '2026-11-25',
      lateFeeDue: 15000,
    })

    expect(updated[0].dueDate).toBe('2026-11-25')
    expect(updated[0].lateFeeDue).toBe(15000)

    const loanWithPaidFirst = makeLoan({
      installments: [
        { ...loan.installments[0], paidAmount: 130000, status: 'PAID' },
        loan.installments[1],
      ],
    })

    expect(() =>
      applyInstallmentUpdate(loanWithPaidFirst, 1, { dueDate: '2026-11-28' })
    ).toThrow(LoanDomainError)

    expect(() =>
      applyInstallmentUpdate(
        makeLoan({ interestModel: 'OPEN_ENDED', installments: [] }),
        1,
        { dueDate: '2026-11-28' }
      )
    ).toThrow(LoanDomainError)
  })
})

describe('features/loans/domain/loan.policy & schemas & WhatsApp helpers', () => {
  it('enforces 5 MB max size, allowed MIME types (jpeg/png/webp/pdf only), and safe user-owned paths', () => {
    expect(isAllowedLoanReceiptMimeType('image/jpeg')).toBe(true)
    expect(isAllowedLoanReceiptMimeType('image/png')).toBe(true)
    expect(isAllowedLoanReceiptMimeType('image/webp')).toBe(true)
    expect(isAllowedLoanReceiptMimeType('application/pdf')).toBe(true)
    expect(isAllowedLoanReceiptMimeType('image/heic')).toBe(false)
    expect(isAllowedLoanReceiptMimeType('image/heif')).toBe(false)
    expect(isAllowedLoanReceiptMimeType('image/gif')).toBe(false)
    expect(isAllowedLoanReceiptMimeType('image/svg+xml')).toBe(false)
    expect(isAllowedLoanReceiptMimeType('text/plain')).toBe(false)

    expect(resolveLoanReceiptExtension('application/pdf', 'doc.png')).toBe(
      'pdf'
    )
    expect(resolveLoanReceiptTypeFromPath('loans/u1/l1/disbursement.pdf')).toBe(
      'PDF'
    )
    expect(resolveLoanReceiptTypeFromPath('loans/u1/l1/disbursement.jpg')).toBe(
      'IMAGE'
    )

    expect(
      validateLoanReceiptFile({
        sizeBytes: MAX_LOAN_RECEIPT_SIZE_BYTES,
        contentType: 'application/pdf',
        fileName: 'soporte.pdf',
      })
    ).toEqual({
      contentType: 'application/pdf',
      extension: 'pdf',
      receiptType: 'PDF',
    })

    expect(() =>
      validateLoanReceiptFile({
        sizeBytes: MAX_LOAN_RECEIPT_SIZE_BYTES + 1,
        contentType: 'image/jpeg',
      })
    ).toThrow(LoanReceiptPolicyError)

    expect(() =>
      validateLoanReceiptFile({
        sizeBytes: 1024,
        contentType: 'application/zip',
      })
    ).toThrow(LoanReceiptPolicyError)

    expect(
      buildLoanReceiptPath('user-1', 'loan-9', 'disbursement', '.JPEG')
    ).toBe('loans/user-1/loan-9/disbursement.jpeg')

    expect(() =>
      buildLoanReceiptPath('../evil', 'loan-9', 'disbursement', 'jpg')
    ).toThrow(LoanReceiptPolicyError)

    expect(
      isOwnedLoanReceiptPath('user-1', 'loans/user-1/loan-9/disbursement.jpg')
    ).toBe(true)
    expect(
      isOwnedLoanReceiptPath('user-1', 'loans/user-2/loan-9/disbursement.jpg')
    ).toBe(false)
    expect(
      isOwnedLoanReceiptPath(
        'user-1',
        'loans/user-1/../user-2/loan-9/disbursement.jpg'
      )
    ).toBe(false)
  })

  it('validates Zod schemas and builds WhatsApp URLs for direct and intermediary loans', () => {
    expect(
      createLoanSchema.parse({
        contactId: 'c-1',
        principalAmount: 500000,
        interestModel: 'OPEN_ENDED',
        disbursementDate: '2026-11-20',
      })
    ).toMatchObject({
      contactId: 'c-1',
      principalAmount: 500000,
      interestRate: 0,
      interestModel: 'OPEN_ENDED',
      notes: null,
    })

    expect(
      registerLoanPaymentSchema.safeParse({ loanId: 'l-1', amount: 0 }).success
    ).toBe(false)

    expect(
      updateInstallmentSchema.safeParse({
        loanId: 'l-1',
        installmentNumber: 1,
      }).success
    ).toBe(false)

    expect(
      refinanceLoanSchema.safeParse({
        loanId: 'l-1',
        principalAmount: 200000,
        interestModel: 'SINGLE_PAYMENT',
        interestRate: 5,
        disbursementDate: '2026-11-20',
      }).success
    ).toBe(true)

    const message = buildLoanReminderMessage({
      contactName: 'Pedro Referido',
      guarantorName: 'Carlos Garante',
      isViaIntermediary: true,
      interestModel: 'DECLINING_BALANCE',
      remainingTotal: 200000,
      isOverdue: true,
      overdueDays: 4,
      nextInstallmentDueDate: '16 nov 2026',
      nextInstallmentRemaining: 100000,
    })

    expect(message).toContain('Carlos Garante')
    expect(message).toContain('Pedro Referido')
    expect(message).toContain('4 días')

    const url = buildLoanWhatsAppUrl('+573001234567', message)
    expect(url.startsWith('https://wa.me/573001234567?text=')).toBe(true)
  })
})

describe('features/loans/domain/loan-schedule.calculator - voiding & deterministic recalculation', () => {
  it('voids a partial payment, preserves receiptPath, and restores installment & balance state exactly', () => {
    const baseLoan = makeLoan()
    const first = applyPaymentToLoan(baseLoan, 80000, {
      id: 'pay-1',
      paidAt: '2026-11-10T10:00:00.000Z',
      receiptPath: 'loans/user-1/loan-1/payment-pay-1.jpg',
      notes: 'Abono 1',
    })
    const afterFirst: Loan = {
      ...baseLoan,
      ...first,
    }

    const second = applyPaymentToLoan(afterFirst, 100000, {
      id: 'pay-2',
      paidAt: '2026-11-15T10:00:00.000Z',
      receiptPath: 'loans/user-1/loan-1/payment-pay-2.jpg',
      notes: 'Abono 2',
    })
    const afterSecond: Loan = {
      ...afterFirst,
      ...second,
    }

    // Void the second payment -> state must match afterFirst exactly
    const voidedSecond = voidPaymentOnLoan(
      afterSecond,
      'pay-2',
      'Monto equivocado al registrar',
      '2026-11-16T09:00:00.000Z'
    )

    expect(voidedSecond.status).toBe('ACTIVE')
    expect(voidedSecond.paidPrincipal).toBe(50000)
    expect(voidedSecond.paidInterest).toBe(30000)
    expect(voidedSecond.installments[0]).toMatchObject({
      paidAmount: 80000,
      status: 'PARTIAL',
    })
    expect(voidedSecond.installments[1]).toMatchObject({
      paidAmount: 0,
      status: 'PENDING',
    })
    expect(voidedSecond.voidedPayment).toMatchObject({
      id: 'pay-2',
      status: 'VOIDED',
      receiptPath: 'loans/user-1/loan-1/payment-pay-2.jpg',
      voidedAt: '2026-11-16T09:00:00.000Z',
      voidReason: 'Monto equivocado al registrar',
    })
  })

  it('reverts a PAID loan back to ACTIVE when the settling payment is voided (scheduled and OPEN_ENDED)', () => {
    // 1. Scheduled loan settled in full, then voided
    const scheduled = makeLoan()
    const fullPay = applyPaymentToLoan(scheduled, 360000, {
      id: 'pay-full',
      paidAt: '2026-11-10T10:00:00.000Z',
      receiptPath: 'loans/user-1/loan-1/payment-pay-full.pdf',
      notes: null,
    })
    const paidScheduled: Loan = { ...scheduled, ...fullPay }
    expect(paidScheduled.status).toBe('PAID')

    const revertedScheduled = voidPaymentOnLoan(
      paidScheduled,
      'pay-full',
      'Transferencia rechazada por el banco',
      '2026-11-11T10:00:00.000Z'
    )

    expect(revertedScheduled.status).toBe('ACTIVE')
    expect(revertedScheduled.paidPrincipal).toBe(0)
    expect(revertedScheduled.paidInterest).toBe(0)
    expect(
      revertedScheduled.installments.every(
        (i) => i.paidAmount === 0 && i.status === 'PENDING'
      )
    ).toBe(true)

    // 2. OPEN_ENDED loan settled in full, then voided
    const openLoan = makeLoan({
      interestModel: 'OPEN_ENDED',
      principalAmount: 100000,
      totalPrincipalDue: 100000,
      totalInterestDue: 0,
      interestRate: 0,
      installments: [],
    })
    const payOpen1 = applyPaymentToLoan(openLoan, 40000, {
      id: 'pay-o1',
      paidAt: '2026-11-01T10:00:00.000Z',
      receiptPath: null,
      notes: null,
    })
    const afterOpen1: Loan = { ...openLoan, ...payOpen1 }
    const payOpen2 = applyPaymentToLoan(afterOpen1, 60000, {
      id: 'pay-o2',
      paidAt: '2026-11-05T10:00:00.000Z',
      receiptPath: null,
      notes: null,
    })
    const paidOpen: Loan = { ...afterOpen1, ...payOpen2 }
    expect(paidOpen.status).toBe('PAID')

    const revertedOpen = voidPaymentOnLoan(
      paidOpen,
      'pay-o2',
      'Pago duplicado por error',
      '2026-11-06T10:00:00.000Z'
    )

    expect(revertedOpen.status).toBe('ACTIVE')
    expect(revertedOpen.paidPrincipal).toBe(40000)
    expect(getLoanTotals({ ...paidOpen, ...revertedOpen }).remainingTotal).toBe(
      60000
    )
  })

  it('replays remaining applied payments cleanly when an earlier payment is voided and handles legacy payments without status', () => {
    const baseLoan = makeLoan()
    // Simulate a legacy payment object without `status` field
    const legacyLoan = makeLoan({
      payments: [
        {
          id: 'pay-legacy-1',
          amount: 130000,
          principalApplied: 100000,
          interestApplied: 30000,
          lateFeeApplied: 0,
          paidAt: '2026-11-01T10:00:00.000Z',
          receiptPath: null,
          notes: null,
        } as unknown as Loan['payments'][number],
        {
          id: 'pay-2',
          amount: 50000,
          principalApplied: 30000,
          interestApplied: 20000,
          lateFeeApplied: 0,
          paidAt: '2026-11-05T10:00:00.000Z',
          receiptPath: null,
          notes: null,
          status: 'APPLIED',
          voidedAt: null,
          voidReason: null,
        },
      ],
    })

    const rebuilt = recalculateLoanStateFromPayments(legacyLoan)
    expect(rebuilt.paidPrincipal).toBe(130000)
    expect(rebuilt.paidInterest).toBe(50000)
    expect(rebuilt.payments[0].status).toBe('APPLIED')

    // Now void the earlier payment -> pay-2 (50,000) must re-allocate against installment #1 (30k int + 20k principal)
    const afterVoidFirst = voidPaymentOnLoan(
      { ...baseLoan, ...rebuilt },
      'pay-legacy-1',
      'Error en abono inicial',
      '2026-11-10T10:00:00.000Z'
    )

    expect(afterVoidFirst.paidInterest).toBe(30000)
    expect(afterVoidFirst.paidPrincipal).toBe(20000)
    expect(afterVoidFirst.installments[0]).toMatchObject({
      paidAmount: 50000,
      status: 'PARTIAL',
    })
    expect(afterVoidFirst.installments[1]).toMatchObject({
      paidAmount: 0,
      status: 'PENDING',
    })
  })

  it('blocks double-voiding, blocks voiding on ARCHIVED/REFINANCED loans, and validates void reason length', () => {
    const loan = makeLoan()
    const applied = applyPaymentToLoan(loan, 50000, {
      id: 'pay-1',
      paidAt: '2026-11-10T10:00:00.000Z',
      receiptPath: null,
      notes: null,
    })
    const withPayment: Loan = { ...loan, ...applied }
    const voided = voidPaymentOnLoan(
      withPayment,
      'pay-1',
      'Motivo válido de prueba',
      '2026-11-11T10:00:00.000Z'
    )

    // Double void must throw PAYMENT_ALREADY_VOIDED
    expect(() =>
      voidPaymentOnLoan(
        { ...withPayment, ...voided },
        'pay-1',
        'Otro intento',
        '2026-11-12T10:00:00.000Z'
      )
    ).toThrow(LoanDomainError)

    // Archived / Refinanced loan cannot void
    expect(() =>
      voidPaymentOnLoan(
        { ...withPayment, status: 'ARCHIVED' },
        'pay-1',
        'Motivo válido',
        '2026-11-11T10:00:00.000Z'
      )
    ).toThrow(LoanDomainError)
    expect(() =>
      voidPaymentOnLoan(
        { ...withPayment, status: 'REFINANCED' },
        'pay-1',
        'Motivo válido',
        '2026-11-11T10:00:00.000Z'
      )
    ).toThrow(LoanDomainError)

    // Schema demands reason >= 5 chars
    expect(
      voidLoanPaymentSchema.safeParse({
        loanId: 'loan-1',
        paymentId: 'pay-1',
        reason: 'abc',
      }).success
    ).toBe(false)
    expect(
      voidLoanPaymentSchema.safeParse({
        loanId: 'loan-1',
        paymentId: 'pay-1',
        reason: '   ',
      }).success
    ).toBe(false)
    expect(
      voidLoanPaymentSchema.safeParse({
        loanId: 'loan-1',
        paymentId: 'pay-1',
        reason: 'Error en el monto registrado',
      }).success
    ).toBe(true)
  })
})

describe('features/loans/domain - OPEN_ENDED with monthly interest & reminders', () => {
  it('sets requiresLoanReminder to false for OPEN_ENDED with 0% and true for OPEN_ENDED with interestRate > 0 or scheduled loans', () => {
    const silentOpenLoan = makeLoan({
      interestModel: 'OPEN_ENDED',
      interestRate: 0,
      principalAmount: 500000,
      totalPrincipalDue: 500000,
      totalInterestDue: 0,
      installments: [],
      monthlyBillingDay: null,
      nextInterestDueDate: null,
    })
    const interestOpenLoan = makeLoan({
      interestModel: 'OPEN_ENDED',
      interestRate: 8,
      principalAmount: 1000000,
      totalPrincipalDue: 1000000,
      totalInterestDue: 80000,
      installments: [],
      disbursementDate: '2026-11-20',
      monthlyBillingDay: 20,
      nextInterestDueDate: '2026-12-20',
    })
    const scheduledLoan = makeLoan({ interestModel: 'DECLINING_BALANCE' })

    expect(requiresLoanReminder(silentOpenLoan)).toBe(false)
    expect(getOpenEndedCurrentInterestDue(silentOpenLoan)).toBe(0)

    expect(requiresLoanReminder(interestOpenLoan)).toBe(true)
    expect(getOpenEndedCurrentInterestDue(interestOpenLoan)).toBe(80000)

    expect(requiresLoanReminder(scheduledLoan)).toBe(true)
    expect(requiresLoanReminder({ ...interestOpenLoan, status: 'PAID' })).toBe(
      false
    )
  })

  it('handles $1,000,000 at 8% monthly: interest-only payment ($80k), mixed payment ($580k -> next interest $40k), voiding, and full payoff', () => {
    const openLoan = makeLoan({
      id: 'loan-indef-8',
      interestModel: 'OPEN_ENDED',
      interestRate: 8,
      principalAmount: 1000000,
      totalPrincipalDue: 1000000,
      totalInterestDue: 80000,
      paidPrincipal: 0,
      paidInterest: 0,
      installments: [],
      payments: [],
      disbursementDate: '2026-11-20',
      monthlyBillingDay: 20,
      nextInterestDueDate: '2026-12-20',
    })

    // 1. Interest-only payment of $80,000 -> capital stays $1,000,000, nextInterestDueDate advances to 2027-01-20
    const pay1 = applyPaymentToLoan(openLoan, 80000, {
      id: 'pay-int-1',
      paidAt: '2026-12-20T10:00:00.000Z',
      receiptPath: null,
      notes: 'Solo intereses mes 1',
    })

    expect(pay1.payment).toMatchObject({
      amount: 80000,
      interestApplied: 80000,
      principalApplied: 0,
    })
    expect(pay1.paidPrincipal).toBe(0)
    expect(pay1.paidInterest).toBe(80000)
    expect(pay1.nextInterestDueDate).toBe('2027-01-20')
    expect(pay1.status).toBe('ACTIVE')

    const afterPay1: Loan = {
      ...openLoan,
      payments: pay1.payments,
      paidPrincipal: pay1.paidPrincipal,
      paidInterest: pay1.paidInterest,
      totalInterestDue: pay1.totalInterestDue,
      nextInterestDueDate: pay1.nextInterestDueDate,
      status: pay1.status,
    }
    expect(getOpenEndedCurrentInterestDue(afterPay1)).toBe(80000)

    // 2. Mixed payment of $580,000 -> $80,000 interest + $500,000 capital -> next monthly interest drops to $40,000
    const pay2 = applyPaymentToLoan(afterPay1, 580000, {
      id: 'pay-mix-2',
      paidAt: '2027-01-20T10:00:00.000Z',
      receiptPath: null,
      notes: 'Intereses + abono a capital',
    })

    expect(pay2.payment).toMatchObject({
      amount: 580000,
      interestApplied: 80000,
      principalApplied: 500000,
    })
    expect(pay2.paidPrincipal).toBe(500000)
    expect(pay2.paidInterest).toBe(160000)
    expect(pay2.nextInterestDueDate).toBe('2027-02-20')
    expect(pay2.status).toBe('ACTIVE')

    const afterPay2: Loan = {
      ...afterPay1,
      payments: pay2.payments,
      paidPrincipal: pay2.paidPrincipal,
      paidInterest: pay2.paidInterest,
      totalInterestDue: pay2.totalInterestDue,
      nextInterestDueDate: pay2.nextInterestDueDate,
      status: pay2.status,
    }
    expect(getOpenEndedCurrentInterestDue(afterPay2)).toBe(40000)
    expect(getLoanTotals(afterPay2)).toMatchObject({
      remainingPrincipal: 500000,
      remainingInterest: 40000,
      remainingTotal: 540000,
    })

    // 3. Voiding pay2 restores capital to $1,000,000, nextInterestDueDate to 2027-01-20, and monthly interest to $80,000
    const afterVoid2 = voidPaymentOnLoan(
      afterPay2,
      'pay-mix-2',
      'Transferencia reversada',
      '2027-01-21T10:00:00.000Z'
    )
    expect(afterVoid2.paidPrincipal).toBe(0)
    expect(afterVoid2.paidInterest).toBe(80000)
    expect(afterVoid2.nextInterestDueDate).toBe('2027-01-20')
    expect(
      getOpenEndedCurrentInterestDue({ ...afterPay2, ...afterVoid2 })
    ).toBe(80000)

    // 4. Settling remaining $540,000 on afterPay2 marks loan PAID and clears nextInterestDueDate
    const pay3 = applyPaymentToLoan(afterPay2, 540000, {
      id: 'pay-final-3',
      paidAt: '2027-02-20T10:00:00.000Z',
      receiptPath: null,
      notes: 'Liquidación total',
    })
    expect(pay3.payment).toMatchObject({
      interestApplied: 40000,
      principalApplied: 500000,
    })
    expect(pay3.status).toBe('PAID')
    expect(pay3.nextInterestDueDate).toBeNull()
  })

  it('builds prefilled WhatsApp interest reminder for OPEN_ENDED with interest (respecting intermediary)', () => {
    const message = buildLoanReminderMessage({
      contactName: 'Pedro Tercero',
      guarantorName: 'Carlos Garante',
      isViaIntermediary: true,
      interestModel: 'OPEN_ENDED',
      interestRate: 8,
      remainingPrincipal: 1000000,
      remainingTotal: 1080000,
      isOverdue: false,
      overdueDays: 0,
      openEndedMonthlyInterestDue: 80000,
      nextInterestDueDate: '20 dic 2026',
    })

    expect(message).toContain('Carlos Garante')
    expect(message).toContain('Pedro Tercero')
    expect(message).toContain('20 dic 2026')
    expect(message).toContain('80.000')
  })
})

describe('features/loans/domain/loan-whatsapp-template', () => {
  it('renders default direct and third-party templates with emojis and all dynamic variables', () => {
    const directMessage = renderWhatsAppLoanMessage({
      template: DEFAULT_DIRECT_LOAN_TEMPLATE,
      recipientName: 'Laura Gómez',
      debtorName: 'Laura Gómez',
      amountFormatted: '$250.000',
      dueDateFormatted: '15 dic 2026',
      remainingPrincipalFormatted: '$1.000.000',
    })

    expect(directMessage).toBe(
      'Hola Laura Gómez \u{1F44B}, te recuerdo que el *15 dic 2026* vence tu pago por *$250.000* (saldo pendiente: $1.000.000). ¡Quedo atento! \u{1F60A}'
    )
    expect(directMessage).not.toContain('\uFFFD')

    const thirdPartyMessage = renderWhatsAppLoanMessage({
      template: DEFAULT_THIRD_PARTY_LOAN_TEMPLATE,
      recipientName: 'Carlos Ruiz',
      debtorName: 'Pedro Pérez',
      amountFormatted: '$150.000',
      dueDateFormatted: '20 dic 2026',
      remainingPrincipalFormatted: '$750.000',
    })

    expect(thirdPartyMessage).toBe(
      'Hola Carlos Ruiz \u{1F44B}, te escribo respecto al préstamo de Pedro Pérez. El *20 dic 2026* vence el pago por *$150.000* (saldo pendiente: $750.000). ¡Muchas gracias! \u{1F64F}'
    )
    expect(thirdPartyMessage).not.toContain('\uFFFD')
  })

  it('safely renders custom templates with omitted variables, repeated variables, and values containing braces', () => {
    const shortCustom = renderWhatsAppLoanMessage({
      template:
        'Buenas {{nombre}}, recuerda el pago de {{monto}}. ¡Gracias {{nombre}}!',
      recipientName: 'Ana {{monto}}',
      debtorName: 'Ana',
      amountFormatted: '$80.000',
      dueDateFormatted: '10 dic 2026',
      remainingPrincipalFormatted: '$400.000',
    })

    expect(shortCustom).toBe(
      'Buenas Ana {{monto}}, recuerda el pago de $80.000. ¡Gracias Ana {{monto}}!'
    )

    const noVariables = renderWhatsAppLoanMessage({
      template: 'Hola, ¿cómo vas con el pago de este mes?',
      recipientName: 'Luis',
      debtorName: 'Luis',
      amountFormatted: '$50.000',
      dueDateFormatted: '05 dic 2026',
      remainingPrincipalFormatted: '$200.000',
    })

    expect(noVariables).toBe('Hola, ¿cómo vas con el pago de este mes?')
  })

  it('builds api.whatsapp.com/send URLs preserving UTF-8 emojis and selecting direct vs third-party templates', () => {
    const emojiMessage = 'Hola Laura 👋, pago de *$250.000* 😊🙏'
    const sendUrl = buildWhatsAppSendUrl('+57 300 111 2233', emojiMessage)
    const parsedUrl = new URL(sendUrl)

    expect(parsedUrl.origin + parsedUrl.pathname).toBe(
      'https://api.whatsapp.com/send'
    )
    expect(parsedUrl.searchParams.get('phone')).toBe('573001112233')
    expect(parsedUrl.searchParams.get('text')).toBe(emojiMessage)
    // Verify raw UTF-8 percent-encoding for multi-byte emojis (e.g. 👋 = %F0%9F%91%8B)
    expect(sendUrl).toContain('%F0%9F%91%8B')
    expect(sendUrl).toContain('%F0%9F%98%8A')
    expect(sendUrl).toContain('%F0%9F%99%8F')

    expect(buildWhatsAppSendUrl('+573001112233', '   ')).toBe(
      'https://api.whatsapp.com/send?phone=573001112233'
    )

    const customTemplates = {
      directLoanTemplate:
        'Directo para {{nombre}} 👋: *{{monto}}* el {{fecha}}.',
      thirdPartyLoanTemplate:
        'Tercero para {{nombre}} 🙏 sobre {{deudor}}: *{{monto}}* (saldo {{saldo}}).',
    }

    const directUrl = buildTemplatedLoanWhatsAppUrl({
      phone: '+573001112233',
      templates: customTemplates,
      isViaIntermediary: false,
      contactName: 'Sofía Castro',
      guarantorName: null,
      amountFormatted: '$120.000',
      dueDateFormatted: '18 dic 2026',
      remainingPrincipalFormatted: '$600.000',
    })

    expect(directUrl).toBe(
      `https://api.whatsapp.com/send?phone=573001112233&text=${encodeURIComponent('Directo para Sofía Castro 👋: *$120.000* el 18 dic 2026.')}`
    )

    const thirdPartyUrl = buildTemplatedLoanWhatsAppUrl({
      phone: '+573109998877',
      templates: customTemplates,
      isViaIntermediary: true,
      contactName: 'Mateo Díaz',
      guarantorName: 'Carlos Codeudor',
      amountFormatted: '$200.000',
      dueDateFormatted: '22 dic 2026',
      remainingPrincipalFormatted: '$800.000',
    })

    expect(thirdPartyUrl).toBe(
      `https://api.whatsapp.com/send?phone=573109998877&text=${encodeURIComponent('Tercero para Carlos Codeudor 🙏 sobre Mateo Díaz: *$200.000* (saldo $800.000).')}`
    )
  })

  it('validates whatsAppTemplatesSchema and executes get/update use cases', async () => {
    expect(
      whatsAppTemplatesSchema.safeParse({
        directLoanTemplate: '   ',
        thirdPartyLoanTemplate: 'Hola {{nombre}}',
      }).success
    ).toBe(false)

    expect(
      whatsAppTemplatesSchema.safeParse({
        directLoanTemplate: 'a'.repeat(1001),
        thirdPartyLoanTemplate: 'Hola {{nombre}}',
      }).success
    ).toBe(false)

    const repo: ILoanSettingsRepository = {
      getWhatsAppTemplates: vi
        .fn()
        .mockResolvedValue({ ...DEFAULT_WHATSAPP_TEMPLATES }),
      saveWhatsAppTemplates: vi
        .fn()
        .mockImplementation(async (_userId, templates) => templates),
    }

    const loaded = await getWhatsAppTemplatesUseCase('user-1', {
      loanSettingsRepository: repo,
    })
    expect(loaded).toEqual(DEFAULT_WHATSAPP_TEMPLATES)

    const saved = await updateWhatsAppTemplatesUseCase(
      'user-1',
      {
        directLoanTemplate: '  Hola {{nombre}}, tu cuota es {{monto}}.  ',
        thirdPartyLoanTemplate: '  Hola {{nombre}}, cuota de {{deudor}}.  ',
      },
      { loanSettingsRepository: repo }
    )

    expect(saved).toEqual({
      directLoanTemplate: 'Hola {{nombre}}, tu cuota es {{monto}}.',
      thirdPartyLoanTemplate: 'Hola {{nombre}}, cuota de {{deudor}}.',
    })
    expect(repo.saveWhatsAppTemplates).toHaveBeenCalledWith('user-1', saved)
  })
})
