import { describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import type { Contact } from '@/features/contacts/domain/contact.entity'
import type { IContactRepository } from '@/features/contacts/domain/contact.repository'
import { archiveLoanUseCase } from '@/features/loans/application/archive-loan.use-case'
import { attachLoanDisbursementReceiptUseCase } from '@/features/loans/application/attach-loan-disbursement-receipt.use-case'
import { attachLoanPaymentReceiptUseCase } from '@/features/loans/application/attach-loan-payment-receipt.use-case'
import { createLoanUseCase } from '@/features/loans/application/create-loan.use-case'
import { getLoanReceiptPreviewUseCase } from '@/features/loans/application/get-loan-receipt-preview.use-case'
import { getLoansBoardUseCase } from '@/features/loans/application/get-loans-board.use-case'
import { refinanceLoanUseCase } from '@/features/loans/application/refinance-loan.use-case'
import { registerLoanPaymentUseCase } from '@/features/loans/application/register-loan-payment.use-case'
import { updateInstallmentUseCase } from '@/features/loans/application/update-installment.use-case'
import { voidLoanPaymentUseCase } from '@/features/loans/application/void-loan-payment.use-case'
import { LoanDomainError, type Loan } from '@/features/loans/domain/loan.entity'
import {
  LoanReceiptPolicyError,
  MAX_LOAN_RECEIPT_SIZE_BYTES,
} from '@/features/loans/domain/loan.policy'
import type {
  ILoanReceiptStorage,
  ILoanRepository,
} from '@/features/loans/domain/loan.repository'

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c-1',
    userId: 'u-1',
    name: 'Carlos Gómez',
    phone: '+573001234567',
    guarantorContactId: null,
    photoPath: null,
    notes: null,
    status: 'ACTIVE',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  }
}

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'l-1',
    userId: 'u-1',
    contactId: 'c-1',
    direction: 'LENT',
    principalAmount: 200000,
    interestRate: 10,
    interestModel: 'SINGLE_PAYMENT',
    totalPrincipalDue: 200000,
    totalInterestDue: 20000,
    paidPrincipal: 0,
    paidInterest: 0,
    installments: [
      {
        installmentNumber: 1,
        dueDate: '2026-11-10',
        principalDue: 200000,
        interestDue: 20000,
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
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
    ...overrides,
  }
}

function createMockLoanRepo(
  overrides: Partial<ILoanRepository> = {}
): ILoanRepository {
  return {
    findByUserId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findByContactId: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    ...overrides,
  }
}

function createMockContactRepo(
  overrides: Partial<IContactRepository> = {}
): IContactRepository {
  return {
    findByUserId: vi.fn().mockResolvedValue([]),
    findActiveByUserId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findActiveByPhone: vi.fn().mockResolvedValue(null),
    findActiveByGuarantorId: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    ...overrides,
  }
}

function createMockReceiptStorage(
  overrides: Partial<ILoanReceiptStorage> = {}
): ILoanReceiptStorage {
  return {
    uploadReceipt: vi.fn().mockResolvedValue({
      receiptPath: 'loans/u-1/l-1/disbursement.jpg',
    }),
    getReceiptReadUrl: vi
      .fn()
      .mockResolvedValue('https://storage.example.com/signed-loan-receipt.jpg'),
    deleteReceipt: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('features/loans/application - getLoansBoardUseCase', () => {
  it('enriches loans with contact & guarantorContact and computes board KPIs accurately', async () => {
    const guarantor = makeContact({
      id: 'c-guarantor',
      name: 'Carlos Garante',
      phone: '+573001112233',
    })
    const thirdParty = makeContact({
      id: 'c-third',
      name: 'Pedro Tercero',
      phone: null,
      guarantorContactId: 'c-guarantor',
    })
    const directContact = makeContact({
      id: 'c-direct',
      name: 'Ana Directa',
      phone: '+573159998877',
    })

    const overdueLoan = makeLoan({
      id: 'l-overdue',
      contactId: 'c-third',
      principalAmount: 300000,
      totalPrincipalDue: 300000,
      totalInterestDue: 30000,
      paidPrincipal: 50000,
      paidInterest: 30000,
      installments: [
        {
          installmentNumber: 1,
          dueDate: '2026-11-10',
          principalDue: 300000,
          interestDue: 30000,
          lateFeeDue: 0,
          paidAmount: 80000,
          status: 'PARTIAL',
        },
      ],
    })

    const openEndedLoan = makeLoan({
      id: 'l-open',
      contactId: 'c-direct',
      interestModel: 'OPEN_ENDED',
      interestRate: 0,
      principalAmount: 100000,
      totalPrincipalDue: 100000,
      totalInterestDue: 0,
      paidPrincipal: 20000,
      paidInterest: 0,
      installments: [],
    })

    const paidLoan = makeLoan({
      id: 'l-paid',
      contactId: 'c-direct',
      principalAmount: 150000,
      totalPrincipalDue: 150000,
      totalInterestDue: 15000,
      paidPrincipal: 150000,
      paidInterest: 15000,
      status: 'PAID',
      installments: [
        {
          installmentNumber: 1,
          dueDate: '2026-10-15',
          principalDue: 150000,
          interestDue: 15000,
          lateFeeDue: 0,
          paidAmount: 165000,
          status: 'PAID',
        },
      ],
    })

    const loanRepository = createMockLoanRepo({
      findByUserId: vi
        .fn()
        .mockResolvedValue([paidLoan, openEndedLoan, overdueLoan]),
    })
    const contactRepository = createMockContactRepo({
      findByUserId: vi
        .fn()
        .mockResolvedValue([guarantor, thirdParty, directContact]),
    })

    const board = await getLoansBoardUseCase('u-1', {
      loanRepository,
      contactRepository,
      referenceDate: '2026-11-20',
    })

    // Priority sort: OVERDUE first, then OPEN_ENDED, then PAID
    expect(board.loans.map((l) => l.id)).toEqual([
      'l-overdue',
      'l-open',
      'l-paid',
    ])

    const enrichedOverdue = board.loans[0]
    expect(enrichedOverdue.isViaIntermediary).toBe(true)
    expect(enrichedOverdue.guarantorContact).toEqual({
      id: 'c-guarantor',
      name: 'Carlos Garante',
      phone: '+573001112233',
    })
    expect(enrichedOverdue.effectivePhone).toBe('+573001112233')
    expect(enrichedOverdue.effectiveStatus).toBe('OVERDUE')
    expect(enrichedOverdue.overdueDays).toBe(10)

    expect(board.loans[1].effectiveStatus).toBe('OPEN_ENDED')
    expect(board.loans[1].isOverdue).toBe(false)
    expect(board.loans[0].openEndedBreakdown).toBeNull()
    expect(board.loans[1].openEndedBreakdown).toBeNull()
    expect(board.loans[2].openEndedBreakdown).toBeNull()

    // Summary KPIs
    expect(board.summary).toMatchObject({
      activePrincipalToCollect: 330000, // 250k + 80k
      activeInterestToCollect: 0,
      totalRecovered: 265000, // 80k + 20k + 165k
      overdueLoansCount: 1,
      overdueAmount: 250000,
      activeLoansCount: 2,
      openEndedLoansCount: 1,
      paidLoansCount: 1,
    })
  })

  it('populates openEndedBreakdown only for OPEN_ENDED loans with interestRate > 0', async () => {
    const contact = makeContact({ id: 'c-direct', name: 'Ana Directa' })
    const openWithInterest = makeLoan({
      id: 'l-open-interest',
      contactId: 'c-direct',
      interestModel: 'OPEN_ENDED',
      interestRate: 8,
      principalAmount: 1000000,
      totalPrincipalDue: 1000000,
      totalInterestDue: 200000,
      paidPrincipal: 500000,
      paidInterest: 160000,
      installments: [],
      monthlyBillingDay: 20,
      nextInterestDueDate: '2026-12-20',
      payments: [
        {
          id: 'p-1',
          amount: 160000,
          principalApplied: 0,
          interestApplied: 160000,
          lateFeeApplied: 0,
          paidAt: '2026-11-20T10:00:00.000Z',
          receiptPath: null,
          notes: null,
          status: 'APPLIED',
          voidedAt: null,
          voidReason: null,
        },
        {
          id: 'p-2-void',
          amount: 40000,
          principalApplied: 0,
          interestApplied: 40000,
          lateFeeApplied: 0,
          paidAt: '2026-11-21T10:00:00.000Z',
          receiptPath: null,
          notes: null,
          status: 'VOIDED',
          voidedAt: '2026-11-22T10:00:00.000Z',
          voidReason: 'Anulado',
        },
      ],
    })
    const openZeroInterest = makeLoan({
      id: 'l-open-zero',
      contactId: 'c-direct',
      interestModel: 'OPEN_ENDED',
      interestRate: 0,
      principalAmount: 400000,
      totalPrincipalDue: 400000,
      totalInterestDue: 0,
      paidPrincipal: 100000,
      paidInterest: 0,
      installments: [],
    })

    const board = await getLoansBoardUseCase('u-1', {
      loanRepository: createMockLoanRepo({
        findByUserId: vi
          .fn()
          .mockResolvedValue([openWithInterest, openZeroInterest]),
      }),
      contactRepository: createMockContactRepo({
        findByUserId: vi.fn().mockResolvedValue([contact]),
      }),
      referenceDate: '2026-11-27',
    })

    const enrichedWithInterest = board.loans.find(
      (loan) => loan.id === 'l-open-interest'
    )
    const enrichedZeroInterest = board.loans.find(
      (loan) => loan.id === 'l-open-zero'
    )

    expect(enrichedWithInterest?.openEndedBreakdown).toEqual({
      capitalAlive: 500000,
      pendingInterest: 40000,
      collectedInterest: 160000,
    })
    expect(enrichedZeroInterest?.openEndedBreakdown).toBeNull()
  })
})

describe('features/loans/application - createLoanUseCase', () => {
  it('validates contact is active, generates schedule, uploads optional disbursement receipt, and updates loan', async () => {
    const activeContact = makeContact({ id: 'c-1', status: 'ACTIVE' })
    const createdLoan = makeLoan({
      id: 'l-new',
      interestModel: 'DECLINING_BALANCE',
      principalAmount: 200000,
      totalPrincipalDue: 200000,
      totalInterestDue: 30000,
      disbursementReceiptPath: null,
    })
    const updatedLoan = {
      ...createdLoan,
      disbursementReceiptPath: 'loans/u-1/l-new/disbursement.jpg',
    }

    const loanRepository = createMockLoanRepo({
      create: vi.fn().mockResolvedValue(createdLoan),
      update: vi.fn().mockResolvedValue(updatedLoan),
    })
    const contactRepository = createMockContactRepo({
      findById: vi.fn().mockResolvedValue(activeContact),
    })
    const loanReceiptStorage = createMockReceiptStorage({
      uploadReceipt: vi.fn().mockResolvedValue({
        receiptPath: 'loans/u-1/l-new/disbursement.jpg',
      }),
    })

    const result = await createLoanUseCase(
      'u-1',
      {
        contactId: 'c-1',
        principalAmount: 200000,
        interestRate: 10,
        interestModel: 'DECLINING_BALANCE',
        disbursementDate: '2026-11-20',
        installmentCount: 2,
        dueDates: ['2026-12-20', '2027-01-20'],
        disbursementReceipt: {
          buffer: Buffer.from('fake-jpeg'),
          contentType: 'image/jpeg',
          fileName: 'transferencia.jpg',
        },
      },
      { loanRepository, contactRepository, loanReceiptStorage }
    )

    expect(loanRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        contactId: 'c-1',
        direction: 'LENT',
        totalPrincipalDue: 200000,
        totalInterestDue: 30000,
        status: 'ACTIVE',
      })
    )
    expect(loanReceiptStorage.uploadReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        loanId: 'l-new',
        filePrefix: 'disbursement',
        contentType: 'image/jpeg',
        extension: 'jpg',
      })
    )
    expect(result.disbursementReceiptPath).toBe(
      'loans/u-1/l-new/disbursement.jpg'
    )
  })

  it('creates an OPEN_ENDED loan without installments and rejects archived contacts or oversized receipts', async () => {
    const activeContact = makeContact({ id: 'c-1', status: 'ACTIVE' })
    const archivedContact = makeContact({ id: 'c-arch', status: 'ARCHIVED' })

    const loanRepository = createMockLoanRepo({
      create: vi.fn().mockImplementation(async (data) => ({
        id: 'l-open',
        createdAt: '2026-11-20T00:00:00.000Z',
        updatedAt: '2026-11-20T00:00:00.000Z',
        ...data,
      })),
    })
    const contactRepository = createMockContactRepo({
      findById: vi.fn().mockImplementation(async (id: string) => {
        if (id === 'c-1') return activeContact
        if (id === 'c-arch') return archivedContact
        return null
      }),
    })
    const loanReceiptStorage = createMockReceiptStorage()

    const openLoan = await createLoanUseCase(
      'u-1',
      {
        contactId: 'c-1',
        principalAmount: 180000,
        interestRate: 0,
        interestModel: 'OPEN_ENDED',
        disbursementDate: '2026-11-20',
      },
      { loanRepository, contactRepository, loanReceiptStorage }
    )

    expect(openLoan.interestModel).toBe('OPEN_ENDED')
    expect(openLoan.interestRate).toBe(0)
    expect(openLoan.installments).toEqual([])
    expect(openLoan.totalInterestDue).toBe(0)
    expect(openLoan.monthlyBillingDay).toBeNull()
    expect(openLoan.nextInterestDueDate).toBeNull()

    // OPEN_ENDED with 8% monthly interest sets monthlyBillingDay & nextInterestDueDate
    const interestOpenLoan = await createLoanUseCase(
      'u-1',
      {
        contactId: 'c-1',
        principalAmount: 1000000,
        interestRate: 8,
        interestModel: 'OPEN_ENDED',
        disbursementDate: '2026-11-20',
        monthlyBillingDay: 20,
      },
      { loanRepository, contactRepository, loanReceiptStorage }
    )

    expect(interestOpenLoan.interestModel).toBe('OPEN_ENDED')
    expect(interestOpenLoan.interestRate).toBe(8)
    expect(interestOpenLoan.totalInterestDue).toBe(80000)
    expect(interestOpenLoan.monthlyBillingDay).toBe(20)
    expect(interestOpenLoan.nextInterestDueDate).toBe('2026-12-20')

    await expect(
      createLoanUseCase(
        'u-1',
        {
          contactId: 'c-arch',
          principalAmount: 100000,
          interestModel: 'OPEN_ENDED',
          disbursementDate: '2026-11-20',
        },
        { loanRepository, contactRepository, loanReceiptStorage }
      )
    ).rejects.toMatchObject({ code: 'CONTACT_ARCHIVED' })

    await expect(
      createLoanUseCase(
        'u-1',
        {
          contactId: 'c-1',
          principalAmount: 100000,
          interestModel: 'OPEN_ENDED',
          disbursementDate: '2026-11-20',
          disbursementReceipt: {
            buffer: Buffer.alloc(MAX_LOAN_RECEIPT_SIZE_BYTES + 1),
            contentType: 'image/jpeg',
          },
        },
        { loanRepository, contactRepository, loanReceiptStorage }
      )
    ).rejects.toBeInstanceOf(LoanReceiptPolicyError)
  })
})

describe('features/loans/application - registerLoanPaymentUseCase & updateInstallmentUseCase', () => {
  it('registers a full payment with receipt, marks loan PAID, and avoids uploading on invalid overpayment', async () => {
    const existingLoan = makeLoan({ id: 'l-1' })

    const loanRepository = createMockLoanRepo({
      findById: vi.fn().mockResolvedValue(existingLoan),
      update: vi.fn().mockImplementation(async (_id, _uid, patch) => ({
        ...existingLoan,
        ...patch,
      })),
    })
    const loanReceiptStorage = createMockReceiptStorage({
      uploadReceipt: vi.fn().mockResolvedValue({
        receiptPath: 'loans/u-1/l-1/payment-pay_fixed.pdf',
      }),
    })

    // Overpayment must fail BEFORE uploading receipt
    await expect(
      registerLoanPaymentUseCase(
        'u-1',
        {
          loanId: 'l-1',
          amount: 500000,
          receipt: {
            buffer: Buffer.from('%PDF-1.7'),
            contentType: 'application/pdf',
          },
        },
        { loanRepository, loanReceiptStorage }
      )
    ).rejects.toMatchObject({ code: 'PAYMENT_EXCEEDS_BALANCE' })

    expect(loanReceiptStorage.uploadReceipt).not.toHaveBeenCalled()

    // Valid full settlement
    const result = await registerLoanPaymentUseCase(
      'u-1',
      {
        loanId: 'l-1',
        amount: 220000,
        paidAt: '2026-11-12',
        notes: 'Pago completo',
        receipt: {
          buffer: Buffer.from('%PDF-1.7'),
          contentType: 'application/pdf',
          fileName: 'abono.pdf',
        },
      },
      {
        loanRepository,
        loanReceiptStorage,
        generatePaymentId: () => 'pay_fixed',
      }
    )

    expect(result.loan.status).toBe('PAID')
    expect(result.payment.interestApplied).toBe(20000)
    expect(result.payment.principalApplied).toBe(200000)
    expect(result.payment.receiptPath).toBe(
      'loans/u-1/l-1/payment-pay_fixed.pdf'
    )
  })

  it('reschedules an installment dueDate and adds lateFeeDue via updateInstallmentUseCase', async () => {
    const existingLoan = makeLoan({ id: 'l-1' })
    const loanRepository = createMockLoanRepo({
      findById: vi.fn().mockResolvedValue(existingLoan),
      update: vi.fn().mockImplementation(async (_id, _uid, patch) => ({
        ...existingLoan,
        ...patch,
      })),
    })

    const updated = await updateInstallmentUseCase(
      'u-1',
      {
        loanId: 'l-1',
        installmentNumber: 1,
        dueDate: '2026-11-28',
        lateFeeDue: 15000,
      },
      { loanRepository }
    )

    expect(updated.installments[0]).toMatchObject({
      dueDate: '2026-11-28',
      lateFeeDue: 15000,
    })
  })
})

describe('features/loans/application - refinanceLoanUseCase, preview & archive', () => {
  it('supports chained refinancing (Loan A -> Loan B -> Loan C) keeping each parent frozen as REFINANCED', async () => {
    const store = new Map<string, Loan>()
    const loanA = makeLoan({
      id: 'loan-A',
      paidPrincipal: 50000,
      payments: [
        {
          id: 'pay-a1',
          amount: 50000,
          principalApplied: 50000,
          interestApplied: 0,
          lateFeeApplied: 0,
          paidAt: '2026-10-20T10:00:00.000Z',
          receiptPath: null,
          notes: null,
          status: 'APPLIED',
          voidedAt: null,
          voidReason: null,
        },
      ],
    })
    store.set(loanA.id, loanA)

    let nextId = 1
    const loanRepository = createMockLoanRepo({
      findById: vi.fn().mockImplementation(async (id: string) => {
        return store.get(id) ?? null
      }),
      update: vi.fn().mockImplementation(async (id: string, _uid, patch) => {
        const current = store.get(id)!
        const updated = { ...current, ...patch }
        store.set(id, updated)
        return updated
      }),
      create: vi.fn().mockImplementation(async (data) => {
        const id = nextId === 1 ? 'loan-B' : 'loan-C'
        nextId += 1
        const created: Loan = {
          id,
          createdAt: '2026-11-20T10:00:00.000Z',
          updatedAt: '2026-11-20T10:00:00.000Z',
          ...data,
        }
        store.set(id, created)
        return created
      }),
    })

    // First refinance: Loan A -> Loan B
    const firstRefi = await refinanceLoanUseCase(
      'u-1',
      {
        loanId: 'loan-A',
        principalAmount: 170000,
        interestRate: 5,
        interestModel: 'DECLINING_BALANCE',
        disbursementDate: '2026-11-20',
        installmentCount: 2,
      },
      { loanRepository }
    )

    expect(firstRefi.previousLoan.status).toBe('REFINANCED')
    expect(firstRefi.previousLoan.payments).toHaveLength(1) // history preserved
    expect(firstRefi.newLoan.id).toBe('loan-B')
    expect(firstRefi.newLoan.parentLoanId).toBe('loan-A')
    expect(firstRefi.newLoan.status).toBe('ACTIVE')

    // Cannot refinance Loan A a second time since it's already REFINANCED
    await expect(
      refinanceLoanUseCase(
        'u-1',
        {
          loanId: 'loan-A',
          principalAmount: 170000,
          interestModel: 'OPEN_ENDED',
          disbursementDate: '2026-11-21',
        },
        { loanRepository }
      )
    ).rejects.toMatchObject({ code: 'LOAN_NOT_ACTIVE' })

    // Second chained refinance: Loan B -> Loan C (as OPEN_ENDED)
    const secondRefi = await refinanceLoanUseCase(
      'u-1',
      {
        loanId: 'loan-B',
        principalAmount: 170000,
        interestModel: 'OPEN_ENDED',
        disbursementDate: '2026-12-01',
      },
      { loanRepository }
    )

    expect(secondRefi.previousLoan.status).toBe('REFINANCED')
    expect(secondRefi.newLoan.id).toBe('loan-C')
    expect(secondRefi.newLoan.parentLoanId).toBe('loan-B')
    expect(secondRefi.newLoan.interestModel).toBe('OPEN_ENDED')
    expect(secondRefi.newLoan.installments).toEqual([])
  })

  it('enforces receipt path ownership in getLoanReceiptPreviewUseCase and archives loans in archiveLoanUseCase', async () => {
    const loanReceiptStorage = createMockReceiptStorage()

    const url = await getLoanReceiptPreviewUseCase(
      {
        userId: 'u-1',
        receiptPath: 'loans/u-1/l-1/disbursement.jpg',
      },
      { loanReceiptStorage }
    )
    expect(url).toBe('https://storage.example.com/signed-loan-receipt.jpg')

    await expect(
      getLoanReceiptPreviewUseCase(
        {
          userId: 'u-1',
          receiptPath: 'loans/u-2/l-1/disbursement.jpg',
        },
        { loanReceiptStorage }
      )
    ).rejects.toBeInstanceOf(LoanReceiptPolicyError)

    await expect(
      getLoanReceiptPreviewUseCase(
        {
          userId: 'u-1',
          receiptPath: 'loans/u-1/../u-2/l-1/disbursement.jpg',
        },
        { loanReceiptStorage }
      )
    ).rejects.toBeInstanceOf(LoanReceiptPolicyError)

    const existingLoan = makeLoan({ id: 'l-1' })
    const loanRepository = createMockLoanRepo({
      findById: vi.fn().mockResolvedValue(existingLoan),
      update: vi
        .fn()
        .mockResolvedValue({ ...existingLoan, status: 'ARCHIVED' }),
    })

    const archived = await archiveLoanUseCase('l-1', 'u-1', { loanRepository })
    expect(archived.status).toBe('ARCHIVED')

    const emptyRepo = createMockLoanRepo({
      findById: vi.fn().mockResolvedValue(null),
    })
    await expect(
      archiveLoanUseCase('l-missing', 'u-1', { loanRepository: emptyRepo })
    ).rejects.toThrow(LoanDomainError)
  })
})

describe('features/loans/application - immutable loan receipts (attach only when null)', () => {
  it('attaches disbursement receipt when loan originally had none, and blocks overwriting once saved', async () => {
    const loanWithoutReceipt = makeLoan({
      id: 'l-1',
      disbursementReceiptPath: null,
    })

    const loanRepository = createMockLoanRepo({
      findById: vi.fn().mockResolvedValue(loanWithoutReceipt),
      update: vi.fn().mockImplementation(async (_id, _uid, patch) => ({
        ...loanWithoutReceipt,
        ...patch,
      })),
    })
    const loanReceiptStorage = createMockReceiptStorage({
      uploadReceipt: vi.fn().mockResolvedValue({
        receiptPath: 'loans/u-1/l-1/disbursement.jpg',
      }),
    })

    const updated = await attachLoanDisbursementReceiptUseCase(
      'u-1',
      {
        loanId: 'l-1',
        receipt: {
          buffer: Buffer.from('jpeg-bytes'),
          contentType: 'image/jpeg',
          fileName: 'desembolso.jpg',
        },
      },
      { loanRepository, loanReceiptStorage }
    )

    expect(loanReceiptStorage.uploadReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        loanId: 'l-1',
        filePrefix: 'disbursement',
        contentType: 'image/jpeg',
        extension: 'jpg',
      })
    )
    expect(updated.disbursementReceiptPath).toBe(
      'loans/u-1/l-1/disbursement.jpg'
    )

    // Attempt to overwrite an existing disbursement receipt MUST be rejected
    const repoWithExisting = createMockLoanRepo({
      findById: vi.fn().mockResolvedValue(updated),
    })
    const storageUnused = createMockReceiptStorage()

    await expect(
      attachLoanDisbursementReceiptUseCase(
        'u-1',
        {
          loanId: 'l-1',
          receipt: {
            buffer: Buffer.from('other-jpeg'),
            contentType: 'image/jpeg',
          },
        },
        { loanRepository: repoWithExisting, loanReceiptStorage: storageUnused }
      )
    ).rejects.toMatchObject({ code: 'RECEIPT_ALREADY_EXISTS' })

    expect(storageUnused.uploadReceipt).not.toHaveBeenCalled()
    expect(repoWithExisting.update).not.toHaveBeenCalled()
  })

  it('rejects unsupported MIME types (e.g. raw image/heic) before touching repository or storage', async () => {
    const loanRepository = createMockLoanRepo()
    const loanReceiptStorage = createMockReceiptStorage()

    await expect(
      attachLoanDisbursementReceiptUseCase(
        'u-1',
        {
          loanId: 'l-1',
          receipt: {
            buffer: Buffer.from('raw-heic'),
            contentType: 'image/heic',
            fileName: 'photo.heic',
          },
        },
        { loanRepository, loanReceiptStorage }
      )
    ).rejects.toBeInstanceOf(LoanReceiptPolicyError)

    expect(loanRepository.findById).not.toHaveBeenCalled()
    expect(loanReceiptStorage.uploadReceipt).not.toHaveBeenCalled()
  })

  it('attaches receipt to payment with null receiptPath, blocks overwriting saved payment receipt, and rejects unknown paymentId', async () => {
    const existingLoan = makeLoan({
      id: 'l-1',
      payments: [
        {
          id: 'pay-1',
          amount: 50000,
          principalApplied: 50000,
          interestApplied: 0,
          lateFeeApplied: 0,
          paidAt: '2026-11-01T10:00:00.000Z',
          receiptPath: 'loans/u-1/l-1/payment-pay-1.jpg',
          notes: null,
          status: 'APPLIED',
          voidedAt: null,
          voidReason: null,
        },
        {
          id: 'pay-2',
          amount: 30000,
          principalApplied: 30000,
          interestApplied: 0,
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

    const loanRepository = createMockLoanRepo({
      findById: vi.fn().mockResolvedValue(existingLoan),
      update: vi.fn().mockImplementation(async (_id, _uid, patch) => ({
        ...existingLoan,
        ...patch,
      })),
    })
    const loanReceiptStorage = createMockReceiptStorage({
      uploadReceipt: vi.fn().mockResolvedValue({
        receiptPath: 'loans/u-1/l-1/payment-pay-2.pdf',
      }),
    })

    // Overwriting pay-1 (already has receiptPath) MUST be blocked
    await expect(
      attachLoanPaymentReceiptUseCase(
        'u-1',
        {
          loanId: 'l-1',
          paymentId: 'pay-1',
          receipt: {
            buffer: Buffer.from('%PDF-1.7'),
            contentType: 'application/pdf',
          },
        },
        { loanRepository, loanReceiptStorage }
      )
    ).rejects.toMatchObject({ code: 'RECEIPT_ALREADY_EXISTS' })

    expect(loanReceiptStorage.uploadReceipt).not.toHaveBeenCalled()

    // Attaching receipt to pay-2 (originally null) succeeds
    const result = await attachLoanPaymentReceiptUseCase(
      'u-1',
      {
        loanId: 'l-1',
        paymentId: 'pay-2',
        receipt: {
          buffer: Buffer.from('%PDF-1.7'),
          contentType: 'application/pdf',
          fileName: 'soporte-abono-2.pdf',
        },
      },
      { loanRepository, loanReceiptStorage }
    )

    expect(result.payment.receiptPath).toBe('loans/u-1/l-1/payment-pay-2.pdf')
    expect(result.loan.payments[0].receiptPath).toBe(
      'loans/u-1/l-1/payment-pay-1.jpg'
    )
    expect(result.loan.payments[1].receiptPath).toBe(
      'loans/u-1/l-1/payment-pay-2.pdf'
    )

    // Unknown paymentId rejected
    await expect(
      attachLoanPaymentReceiptUseCase(
        'u-1',
        {
          loanId: 'l-1',
          paymentId: 'pay-missing',
          receipt: {
            buffer: Buffer.from('jpeg-data'),
            contentType: 'image/jpeg',
          },
        },
        { loanRepository, loanReceiptStorage }
      )
    ).rejects.toMatchObject({ code: 'PAYMENT_NOT_FOUND' })
  })

  it('cleans up uploaded file if repository update fails while attaching disbursement receipt', async () => {
    const existingLoan = makeLoan({
      id: 'l-1',
      disbursementReceiptPath: null,
    })

    const loanRepository = createMockLoanRepo({
      findById: vi.fn().mockResolvedValue(existingLoan),
      update: vi.fn().mockRejectedValue(new Error('firestore unavailable')),
    })
    const loanReceiptStorage = createMockReceiptStorage({
      uploadReceipt: vi.fn().mockResolvedValue({
        receiptPath: 'loans/u-1/l-1/disbursement.jpg',
      }),
    })

    await expect(
      attachLoanDisbursementReceiptUseCase(
        'u-1',
        {
          loanId: 'l-1',
          receipt: {
            buffer: Buffer.from('new-jpeg'),
            contentType: 'image/jpeg',
          },
        },
        { loanRepository, loanReceiptStorage }
      )
    ).rejects.toThrow(/firestore unavailable/i)

    expect(loanReceiptStorage.deleteReceipt).toHaveBeenCalledWith(
      'loans/u-1/l-1/disbursement.jpg'
    )
  })
})

describe('features/loans/application - voidLoanPaymentUseCase', () => {
  it('voids a settling payment, keeps receiptPath intact, restores balance, and reopens PAID loan as ACTIVE', async () => {
    const paidLoan = makeLoan({
      id: 'l-paid',
      paidPrincipal: 200000,
      paidInterest: 20000,
      status: 'PAID',
      installments: [
        {
          installmentNumber: 1,
          dueDate: '2026-11-10',
          principalDue: 200000,
          interestDue: 20000,
          lateFeeDue: 0,
          paidAmount: 220000,
          status: 'PAID',
        },
      ],
      payments: [
        {
          id: 'pay-1',
          amount: 220000,
          principalApplied: 200000,
          interestApplied: 20000,
          lateFeeApplied: 0,
          paidAt: '2026-11-10T10:00:00.000Z',
          receiptPath: 'loans/u-1/l-paid/payment-pay-1.jpg',
          notes: 'Abono registrado por error',
          status: 'APPLIED',
          voidedAt: null,
          voidReason: null,
        },
      ],
    })

    const loanRepository = createMockLoanRepo({
      findById: vi.fn().mockResolvedValue(paidLoan),
      update: vi.fn().mockImplementation(async (_id, _uid, patch) => ({
        ...paidLoan,
        ...patch,
      })),
    })

    const result = await voidLoanPaymentUseCase(
      {
        userId: 'u-1',
        loanId: 'l-paid',
        paymentId: 'pay-1',
        reason: 'Transferencia reversada por error de cuenta',
      },
      {
        loanRepository,
        now: () => new Date('2026-11-12T15:00:00.000Z'),
      }
    )

    expect(result.loan.status).toBe('ACTIVE')
    expect(result.loan.paidPrincipal).toBe(0)
    expect(result.loan.paidInterest).toBe(0)
    expect(result.loan.installments[0]).toMatchObject({
      paidAmount: 0,
      status: 'PENDING',
    })
    expect(result.voidedPayment).toMatchObject({
      id: 'pay-1',
      status: 'VOIDED',
      receiptPath: 'loans/u-1/l-paid/payment-pay-1.jpg',
      voidedAt: '2026-11-12T15:00:00.000Z',
      voidReason: 'Transferencia reversada por error de cuenta',
    })
    expect(loanRepository.update).toHaveBeenCalledTimes(1)
  })

  it('requires a non-empty reason (>= 5 chars) before touching repository', async () => {
    const loanRepository = createMockLoanRepo()

    await expect(
      voidLoanPaymentUseCase(
        {
          userId: 'u-1',
          loanId: 'l-1',
          paymentId: 'pay-1',
          reason: 'err',
        },
        { loanRepository }
      )
    ).rejects.toBeInstanceOf(ZodError)

    expect(loanRepository.findById).not.toHaveBeenCalled()
    expect(loanRepository.update).not.toHaveBeenCalled()
  })

  it('blocks double voiding and blocks voiding on ARCHIVED or REFINANCED loans', async () => {
    const alreadyVoidedLoan = makeLoan({
      id: 'l-1',
      payments: [
        {
          id: 'pay-1',
          amount: 50000,
          principalApplied: 30000,
          interestApplied: 20000,
          lateFeeApplied: 0,
          paidAt: '2026-11-10T10:00:00.000Z',
          receiptPath: null,
          notes: null,
          status: 'VOIDED',
          voidedAt: '2026-11-11T10:00:00.000Z',
          voidReason: 'Ya fue anulado',
        },
      ],
    })

    const repoVoided = createMockLoanRepo({
      findById: vi.fn().mockResolvedValue(alreadyVoidedLoan),
    })

    await expect(
      voidLoanPaymentUseCase(
        {
          userId: 'u-1',
          loanId: 'l-1',
          paymentId: 'pay-1',
          reason: 'Intento duplicado de anulación',
        },
        { loanRepository: repoVoided }
      )
    ).rejects.toMatchObject({ code: 'PAYMENT_ALREADY_VOIDED' })
    expect(repoVoided.update).not.toHaveBeenCalled()

    const refinancedLoan = makeLoan({
      id: 'l-refi',
      status: 'REFINANCED',
      payments: [
        {
          id: 'pay-1',
          amount: 50000,
          principalApplied: 30000,
          interestApplied: 20000,
          lateFeeApplied: 0,
          paidAt: '2026-11-10T10:00:00.000Z',
          receiptPath: null,
          notes: null,
          status: 'APPLIED',
          voidedAt: null,
          voidReason: null,
        },
      ],
    })

    const repoRefinanced = createMockLoanRepo({
      findById: vi.fn().mockResolvedValue(refinancedLoan),
    })

    await expect(
      voidLoanPaymentUseCase(
        {
          userId: 'u-1',
          loanId: 'l-refi',
          paymentId: 'pay-1',
          reason: 'Intento en refinanciado',
        },
        { loanRepository: repoRefinanced }
      )
    ).rejects.toMatchObject({ code: 'LOAN_CANNOT_VOID_PAYMENT' })

    const repoArchived = createMockLoanRepo({
      findById: vi
        .fn()
        .mockResolvedValue({ ...refinancedLoan, status: 'ARCHIVED' }),
    })

    await expect(
      voidLoanPaymentUseCase(
        {
          userId: 'u-1',
          loanId: 'l-refi',
          paymentId: 'pay-1',
          reason: 'Intento en archivado',
        },
        { loanRepository: repoArchived }
      )
    ).rejects.toMatchObject({ code: 'LOAN_CANNOT_VOID_PAYMENT' })
  })
})

describe('features/loans/application - OPEN_ENDED with monthly interest end-to-end flow', () => {
  it('processes interest-only ($80k) and mixed ($580k) payments on $1,000,000 @ 8% and enriches board with reminder & currentCycleInterestDue', async () => {
    const contact = makeContact({ id: 'c-1', name: 'Carlos Gómez' })
    let storedLoan: Loan = makeLoan({
      id: 'l-open-8',
      contactId: 'c-1',
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

    const loanRepository = createMockLoanRepo({
      findById: vi.fn().mockImplementation(async () => storedLoan),
      findByUserId: vi.fn().mockImplementation(async () => [storedLoan]),
      update: vi.fn().mockImplementation(async (_id, _uid, patch) => {
        storedLoan = { ...storedLoan, ...patch }
        return storedLoan
      }),
    })
    const contactRepository = createMockContactRepo({
      findByUserId: vi.fn().mockResolvedValue([contact]),
    })
    const loanReceiptStorage = createMockReceiptStorage()

    // Month 1: $80,000 interest-only payment
    const firstPayment = await registerLoanPaymentUseCase(
      'u-1',
      {
        loanId: 'l-open-8',
        amount: 80000,
        paidAt: '2026-12-20T10:00:00.000Z',
      },
      {
        loanRepository,
        loanReceiptStorage,
        generatePaymentId: () => 'pay_m1',
      }
    )

    expect(firstPayment.payment.interestApplied).toBe(80000)
    expect(firstPayment.payment.principalApplied).toBe(0)
    expect(firstPayment.loan.paidPrincipal).toBe(0)
    expect(firstPayment.loan.nextInterestDueDate).toBe('2027-01-20')

    // Month 2: $580,000 mixed payment ($80k interest + $500k principal)
    const secondPayment = await registerLoanPaymentUseCase(
      'u-1',
      {
        loanId: 'l-open-8',
        amount: 580000,
        paidAt: '2027-01-20T10:00:00.000Z',
      },
      {
        loanRepository,
        loanReceiptStorage,
        generatePaymentId: () => 'pay_m2',
      }
    )

    expect(secondPayment.payment.interestApplied).toBe(80000)
    expect(secondPayment.payment.principalApplied).toBe(500000)
    expect(secondPayment.loan.paidPrincipal).toBe(500000)
    expect(secondPayment.loan.nextInterestDueDate).toBe('2027-02-20')

    const board = await getLoansBoardUseCase('u-1', {
      loanRepository,
      contactRepository,
      referenceDate: '2027-01-25',
    })

    expect(board.loans[0].requiresReminder).toBe(true)
    expect(board.loans[0].currentCycleInterestDue).toBe(40000)
    expect(board.loans[0].nextInterestDueDate).toBe('2027-02-20')
    expect(board.summary.activePrincipalToCollect).toBe(500000)
    expect(board.summary.activeInterestToCollect).toBe(40000)
  })
})
