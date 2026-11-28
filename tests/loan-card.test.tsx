// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  archiveLoanAction: vi.fn(),
}))

vi.mock('@/features/loans/presentation/actions/loan.actions', () => ({
  archiveLoanAction: mocks.archiveLoanAction,
}))

import type { EnrichedLoan } from '@/features/loans/application/get-loans-board.use-case'
import {
  formatCurrency,
  getLoanTotals,
  getOpenEndedInterestBreakdown,
  isOpenEndedWithInterest,
  type Loan,
  type LoanInterestModel,
} from '@/features/loans/domain/loan.entity'
import {
  evaluateLoanEffectiveStatus,
  formatIsoDateDisplay,
  getOpenEndedCurrentInterestDue,
  requiresLoanReminder,
} from '@/features/loans/domain/loan-schedule.calculator'
import { DEFAULT_WHATSAPP_TEMPLATES } from '@/features/loans/domain/loan-whatsapp-template'
import { LoanCard } from '@/features/loans/presentation/components/loan-card'

function normalizeCurrency(amount: number): string {
  return formatCurrency(amount).replace(/\s+/g, ' ')
}

function getBreakdownValueByLabel(label: string): string {
  const term = screen.getByText(label)
  const valueNode = term.nextElementSibling
  if (!valueNode) {
    throw new Error(`Missing breakdown value element for "${label}"`)
  }
  return (valueNode.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function buildEnrichedLoan(overrides: Partial<Loan> = {}): EnrichedLoan {
  const baseLoan: Loan = {
    id: 'loan-1',
    userId: 'user-1',
    contactId: 'contact-1',
    direction: 'LENT',
    principalAmount: 1000000,
    interestRate: 0,
    interestModel: 'NO_INTEREST',
    totalPrincipalDue: 1000000,
    totalInterestDue: 0,
    paidPrincipal: 250000,
    paidInterest: 0,
    installments: [
      {
        installmentNumber: 1,
        dueDate: '2026-12-10',
        principalDue: 500000,
        interestDue: 0,
        lateFeeDue: 0,
        paidAmount: 250000,
        status: 'PARTIAL',
      },
      {
        installmentNumber: 2,
        dueDate: '2027-01-10',
        principalDue: 500000,
        interestDue: 0,
        lateFeeDue: 0,
        paidAmount: 0,
        status: 'PENDING',
      },
    ],
    payments: [
      {
        id: 'pay-1',
        amount: 250000,
        principalApplied: 250000,
        interestApplied: 0,
        lateFeeApplied: 0,
        paidAt: '2026-11-25T10:00:00.000Z',
        receiptPath: null,
        notes: null,
        status: 'APPLIED',
        voidedAt: null,
        voidReason: null,
      },
    ],
    disbursementDate: '2026-11-10',
    disbursementReceiptPath: null,
    monthlyBillingDay: null,
    nextInterestDueDate: null,
    status: 'ACTIVE',
    parentLoanId: null,
    notes: null,
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
    ...overrides,
  }

  const evaluated = evaluateLoanEffectiveStatus(baseLoan, '2026-11-27')
  const totals = getLoanTotals(baseLoan)
  const openEndedBreakdown = isOpenEndedWithInterest(baseLoan)
    ? getOpenEndedInterestBreakdown(baseLoan)
    : null

  return {
    ...baseLoan,
    ...evaluated,
    contact: {
      id: 'contact-1',
      name: 'Laura Gómez',
      phone: '+573001112233',
      guarantorContactId: null,
      status: 'ACTIVE',
    },
    guarantorContact: null,
    effectivePhone: '+573001112233',
    isViaIntermediary: false,
    totals,
    openEndedBreakdown,
    currentCycleInterestDue: getOpenEndedCurrentInterestDue(baseLoan),
    requiresReminder: requiresLoanReminder(baseLoan),
  }
}

function renderCard(loan: EnrichedLoan) {
  return render(
    <LoanCard
      loan={loan}
      whatsAppTemplates={DEFAULT_WHATSAPP_TEMPLATES}
      onRegisterPayment={vi.fn()}
      onViewDetail={vi.fn()}
      onRefinance={vi.fn()}
      onPreviewReceipt={vi.fn()}
      onAttachReceipt={vi.fn()}
    />
  )
}

afterEach(() => {
  cleanup()
})

describe('LoanCard balance visualization', () => {
  it('renders the 3 direct indicators and next-interest strip without a progress bar for OPEN_ENDED loans with interestRate > 0', () => {
    const loan = buildEnrichedLoan({
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
          id: 'pay-int-1',
          amount: 80000,
          principalApplied: 0,
          interestApplied: 80000,
          lateFeeApplied: 0,
          paidAt: '2026-10-20T10:00:00.000Z',
          receiptPath: null,
          notes: null,
          status: 'APPLIED',
          voidedAt: null,
          voidReason: null,
        },
        {
          id: 'pay-mix-2',
          amount: 580000,
          principalApplied: 500000,
          interestApplied: 80000,
          lateFeeApplied: 0,
          paidAt: '2026-11-20T10:00:00.000Z',
          receiptPath: null,
          notes: null,
          status: 'APPLIED',
          voidedAt: null,
          voidReason: null,
        },
        {
          id: 'pay-voided-3',
          amount: 40000,
          principalApplied: 0,
          interestApplied: 40000,
          lateFeeApplied: 0,
          paidAt: '2026-11-21T10:00:00.000Z',
          receiptPath: null,
          notes: null,
          status: 'VOIDED',
          voidedAt: '2026-11-22T10:00:00.000Z',
          voidReason: 'Registro duplicado',
        },
      ],
    })

    renderCard(loan)

    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/Recuperado:/i)).toBeNull()
    expect(screen.queryByText(/Total:/i)).toBeNull()

    expect(screen.getByText('Saldo pendiente total')).toBeTruthy()
    expect(screen.getByText(normalizeCurrency(540000))).toBeTruthy()

    expect(getBreakdownValueByLabel('Capital vivo')).toBe(
      normalizeCurrency(500000)
    )
    expect(getBreakdownValueByLabel('Intereses pendientes')).toBe(
      normalizeCurrency(40000)
    )
    expect(getBreakdownValueByLabel('Ganancia cobrada')).toBe(
      normalizeCurrency(160000)
    )

    // Preserves bottom "Próximo interés" strip with cutoff date & estimated amount
    expect(screen.getByText('Próximo interés (8% / mes)')).toBeTruthy()
    expect(
      screen.getByText(formatIsoDateDisplay('2026-12-20').replace(/\s+/g, ' '))
    ).toBeTruthy()
  })

  it('shows $ 0 in Intereses pendientes when an OPEN_ENDED loan with interest has no unpaid interest', () => {
    const loan = buildEnrichedLoan({
      interestModel: 'OPEN_ENDED',
      interestRate: 5,
      principalAmount: 1000000,
      totalPrincipalDue: 1000000,
      totalInterestDue: 100000,
      paidPrincipal: 0,
      paidInterest: 100000,
      installments: [],
      monthlyBillingDay: 15,
      nextInterestDueDate: '2026-12-15',
      payments: [
        {
          id: 'pay-int-1',
          amount: 100000,
          principalApplied: 0,
          interestApplied: 100000,
          lateFeeApplied: 0,
          paidAt: '2026-11-15T10:00:00.000Z',
          receiptPath: null,
          notes: null,
          status: 'APPLIED',
          voidedAt: null,
          voidReason: null,
        },
      ],
    })

    renderCard(loan)

    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(getBreakdownValueByLabel('Capital vivo')).toBe(
      normalizeCurrency(1000000)
    )
    expect(getBreakdownValueByLabel('Intereses pendientes')).toBe(
      normalizeCurrency(0)
    )
    expect(getBreakdownValueByLabel('Ganancia cobrada')).toBe(
      normalizeCurrency(100000)
    )
    expect(screen.getByText('Próximo interés (5% / mes)')).toBeTruthy()
  })

  it('keeps the green progress bar and Recuperado / Total summary for OPEN_ENDED loans with 0% interest', () => {
    const loan = buildEnrichedLoan({
      interestModel: 'OPEN_ENDED',
      interestRate: 0,
      principalAmount: 1000000,
      totalPrincipalDue: 1000000,
      totalInterestDue: 0,
      paidPrincipal: 250000,
      paidInterest: 0,
      installments: [],
      monthlyBillingDay: null,
      nextInterestDueDate: null,
    })

    renderCard(loan)

    const progressbar = screen.getByRole('progressbar')
    expect(progressbar.getAttribute('aria-valuenow')).toBe('25')
    expect(
      screen.getByText(`Recuperado: ${normalizeCurrency(250000)} (25%)`)
    ).toBeTruthy()
    expect(
      screen.getByText(`Total: ${normalizeCurrency(1000000)}`)
    ).toBeTruthy()

    expect(screen.queryByText('Capital vivo')).toBeNull()
    expect(screen.queryByText('Intereses pendientes')).toBeNull()
    expect(screen.queryByText('Ganancia cobrada')).toBeNull()
  })

  it.each<{
    model: Exclude<LoanInterestModel, 'OPEN_ENDED'>
    interestRate: number
    totalInterestDue: number
  }>([
    { model: 'NO_INTEREST', interestRate: 0, totalInterestDue: 0 },
    { model: 'SINGLE_PAYMENT', interestRate: 10, totalInterestDue: 100000 },
    {
      model: 'INTEREST_ONLY_BALLOON',
      interestRate: 5,
      totalInterestDue: 150000,
    },
    { model: 'DECLINING_BALANCE', interestRate: 10, totalInterestDue: 100000 },
  ])(
    'keeps the progress bar and Recuperado / Total summary for $model loans',
    ({ model, interestRate, totalInterestDue }) => {
      const loan = buildEnrichedLoan({
        interestModel: model,
        interestRate,
        principalAmount: 1000000,
        totalPrincipalDue: 1000000,
        totalInterestDue,
        paidPrincipal: 250000,
        paidInterest: 0,
      })

      renderCard(loan)

      expect(screen.getByRole('progressbar')).toBeTruthy()
      expect(screen.getByText(/Recuperado:/i)).toBeTruthy()
      expect(screen.getByText(/Total:/i)).toBeTruthy()
      expect(screen.queryByText('Capital vivo')).toBeNull()
      expect(screen.queryByText('Intereses pendientes')).toBeNull()
      expect(screen.queryByText('Ganancia cobrada')).toBeNull()
    }
  )
})
