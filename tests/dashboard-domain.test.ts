import { describe, expect, it, vi } from 'vitest'

import type { Contact } from '@/features/contacts/domain/contact.entity'
import type { IContactRepository } from '@/features/contacts/domain/contact.repository'
import { getDashboardOverviewUseCase } from '@/features/dashboard/application/get-dashboard-overview.use-case'
import {
  buildClampedIsoDate,
  buildMonthGridDays,
  buildMonthlyCalendarData,
  buildUpcomingEventsRadar,
} from '@/features/dashboard/domain/calendar-aggregator'
import type { Loan } from '@/features/loans/domain/loan.entity'
import type { ILoanRepository } from '@/features/loans/domain/loan.repository'
import type {
  Service,
  ServicePayment,
} from '@/features/services/domain/service.entity'
import type { IServiceRepository } from '@/features/services/domain/service.repository'

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-1',
    userId: 'user-1',
    name: 'Laura Gómez',
    phone: '+573001112233',
    guarantorContactId: null,
    photoPath: null,
    notes: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-1',
    userId: 'user-1',
    name: 'Internet Fibra',
    billingDay: 15,
    startPeriod: '2026-01',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeServicePayment(
  overrides: Partial<ServicePayment> = {}
): ServicePayment {
  return {
    id: 'pay-1',
    userId: 'user-1',
    serviceId: 'svc-1',
    period: '2026-11',
    paidAt: '2026-11-10T12:00:00.000Z',
    receiptUrl: 'https://example.com/receipt.jpg',
    receiptType: 'IMAGE',
    receiptPath: 'receipts/user-1/svc-1/2026-11.jpg',
    ...overrides,
  }
}

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: 'loan-1',
    userId: 'user-1',
    contactId: 'contact-1',
    direction: 'LENT',
    principalAmount: 1_000_000,
    interestRate: 0,
    interestModel: 'NO_INTEREST',
    totalPrincipalDue: 1_000_000,
    totalInterestDue: 0,
    paidPrincipal: 0,
    paidInterest: 0,
    installments: [],
    payments: [],
    disbursementDate: '2026-10-01',
    disbursementReceiptPath: null,
    monthlyBillingDay: null,
    nextInterestDueDate: null,
    status: 'ACTIVE',
    parentLoanId: null,
    notes: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('Dashboard calendar aggregator (domain)', () => {
  describe('services projection', () => {
    it('projects active services with PAID, OVERDUE, and PENDING statuses and excludes archived or not-yet-started services', () => {
      const services: Service[] = [
        makeService({
          id: 'svc-paid',
          name: 'Energía',
          billingDay: 5,
          startPeriod: '2026-01',
          referenceCode: 'EN-{YYYY}{MM}',
        }),
        makeService({
          id: 'svc-overdue',
          name: 'Agua',
          billingDay: 10,
          startPeriod: '2026-01',
        }),
        makeService({
          id: 'svc-pending',
          name: 'Arriendo',
          billingDay: 25,
          startPeriod: '2026-11',
        }),
        makeService({
          id: 'svc-future',
          name: 'Suscripción Futura',
          billingDay: 12,
          startPeriod: '2026-12',
        }),
        makeService({
          id: 'svc-archived',
          name: 'TV Cable Viejo',
          billingDay: 8,
          startPeriod: '2026-01',
          status: 'ARCHIVED',
        }),
      ]

      const payments: ServicePayment[] = [
        makeServicePayment({
          id: 'p-1',
          serviceId: 'svc-paid',
          period: '2026-11',
        }),
      ]

      const result = buildMonthlyCalendarData({
        month: 11,
        year: 2026,
        services,
        servicePayments: payments,
        loans: [],
        contacts: [],
        referenceDate: '2026-11-15',
      })

      expect(result.events).toHaveLength(3)

      const paidEvent = result.events.find((e) => e.referenceId === 'svc-paid')
      expect(paidEvent).toMatchObject({
        date: '2026-11-05',
        type: 'SERVICE_DUE',
        title: 'Energía',
        subtitle: 'Servicio mensual · Ref: EN-202611',
        amount: null,
        status: 'PAID',
      })

      const overdueEvent = result.events.find(
        (e) => e.referenceId === 'svc-overdue'
      )
      expect(overdueEvent).toMatchObject({
        date: '2026-11-10',
        type: 'SERVICE_DUE',
        status: 'OVERDUE',
      })

      const pendingEvent = result.events.find(
        (e) => e.referenceId === 'svc-pending'
      )
      expect(pendingEvent).toMatchObject({
        date: '2026-11-25',
        type: 'SERVICE_DUE',
        status: 'PENDING',
      })

      expect(result.summary.servicesTotalDue).toBe(3)
      expect(result.summary.servicesPaid).toBe(1)
      expect(result.summary.overdueCount).toBe(1)
    })

    it('clamps service billingDay 31 to the last valid day of shorter months', () => {
      const services = [
        makeService({
          id: 'svc-31',
          name: 'Arriendo Fin de Mes',
          billingDay: 31,
          startPeriod: '2026-01',
        }),
      ]

      const febResult = buildMonthlyCalendarData({
        month: 2,
        year: 2026,
        services,
        servicePayments: [],
        loans: [],
        contacts: [],
        referenceDate: '2026-02-10',
      })

      expect(febResult.events[0]?.date).toBe('2026-02-28')
      expect(buildClampedIsoDate(2024, 2, 31)).toBe('2024-02-29')
    })
  })

  describe('scheduled loans projection', () => {
    it('projects installments from SINGLE_PAYMENT, NO_INTEREST, INTEREST_ONLY_BALLOON, and DECLINING_BALANCE falling in the queried month', () => {
      const guarantor = makeContact({
        id: 'guarantor-1',
        name: 'Carlos Codeudor',
        phone: '+573109998877',
      })
      const directContact = makeContact({
        id: 'contact-direct',
        name: 'Ana Pérez',
        phone: '+573001234567',
      })
      const intermediaryContact = makeContact({
        id: 'contact-via',
        name: 'Mateo Díaz',
        phone: null,
        guarantorContactId: 'guarantor-1',
      })

      const loans: Loan[] = [
        makeLoan({
          id: 'loan-single',
          contactId: 'contact-direct',
          interestModel: 'SINGLE_PAYMENT',
          interestRate: 10,
          principalAmount: 500_000,
          totalPrincipalDue: 500_000,
          totalInterestDue: 50_000,
          installments: [
            {
              installmentNumber: 1,
              dueDate: '2026-11-10',
              principalDue: 500_000,
              interestDue: 50_000,
              lateFeeDue: 0,
              paidAmount: 0,
              status: 'PENDING',
            },
          ],
        }),
        makeLoan({
          id: 'loan-no-int',
          contactId: 'contact-via',
          interestModel: 'NO_INTEREST',
          principalAmount: 600_000,
          totalPrincipalDue: 600_000,
          paidPrincipal: 200_000,
          installments: [
            {
              installmentNumber: 1,
              dueDate: '2026-10-15',
              principalDue: 200_000,
              interestDue: 0,
              lateFeeDue: 0,
              paidAmount: 200_000,
              status: 'PAID',
            },
            {
              installmentNumber: 2,
              dueDate: '2026-11-18',
              principalDue: 200_000,
              interestDue: 0,
              lateFeeDue: 0,
              paidAmount: 50_000,
              status: 'PARTIAL',
            },
            {
              installmentNumber: 3,
              dueDate: '2026-12-18',
              principalDue: 200_000,
              interestDue: 0,
              lateFeeDue: 0,
              paidAmount: 0,
              status: 'PENDING',
            },
          ],
        }),
        makeLoan({
          id: 'loan-balloon',
          contactId: 'contact-direct',
          interestModel: 'INTEREST_ONLY_BALLOON',
          interestRate: 5,
          principalAmount: 1_000_000,
          totalPrincipalDue: 1_000_000,
          totalInterestDue: 100_000,
          paidInterest: 50_000,
          installments: [
            {
              installmentNumber: 1,
              dueDate: '2026-11-05',
              principalDue: 0,
              interestDue: 50_000,
              lateFeeDue: 0,
              paidAmount: 50_000,
              status: 'PAID',
            },
            {
              installmentNumber: 2,
              dueDate: '2026-12-05',
              principalDue: 1_000_000,
              interestDue: 50_000,
              lateFeeDue: 0,
              paidAmount: 0,
              status: 'PENDING',
            },
          ],
        }),
        makeLoan({
          id: 'loan-declining',
          contactId: 'contact-direct',
          interestModel: 'DECLINING_BALANCE',
          interestRate: 4,
          principalAmount: 800_000,
          totalPrincipalDue: 800_000,
          totalInterestDue: 48_000,
          installments: [
            {
              installmentNumber: 1,
              dueDate: '2026-11-28',
              principalDue: 400_000,
              interestDue: 32_000,
              lateFeeDue: 0,
              paidAmount: 0,
              status: 'PENDING',
            },
            {
              installmentNumber: 2,
              dueDate: '2026-12-28',
              principalDue: 400_000,
              interestDue: 16_000,
              lateFeeDue: 0,
              paidAmount: 0,
              status: 'PENDING',
            },
          ],
        }),
        makeLoan({
          id: 'loan-archived',
          contactId: 'contact-direct',
          interestModel: 'SINGLE_PAYMENT',
          status: 'ARCHIVED',
          principalAmount: 999_000,
          totalPrincipalDue: 999_000,
          installments: [
            {
              installmentNumber: 1,
              dueDate: '2026-11-20',
              principalDue: 999_000,
              interestDue: 0,
              lateFeeDue: 0,
              paidAmount: 0,
              status: 'PENDING',
            },
          ],
        }),
        makeLoan({
          id: 'loan-refinanced',
          contactId: 'contact-direct',
          interestModel: 'SINGLE_PAYMENT',
          status: 'REFINANCED',
          principalAmount: 777_000,
          totalPrincipalDue: 777_000,
          installments: [
            {
              installmentNumber: 1,
              dueDate: '2026-11-20',
              principalDue: 777_000,
              interestDue: 0,
              lateFeeDue: 0,
              paidAmount: 0,
              status: 'PENDING',
            },
          ],
        }),
      ]

      const result = buildMonthlyCalendarData({
        month: 11,
        year: 2026,
        services: [],
        servicePayments: [],
        loans,
        contacts: [guarantor, directContact, intermediaryContact],
        referenceDate: '2026-11-15',
      })

      expect(result.events).toHaveLength(4)

      const singleEvent = result.events.find(
        (e) => e.referenceId === 'loan-single'
      )
      expect(singleEvent).toMatchObject({
        date: '2026-11-10',
        type: 'LOAN_INSTALLMENT',
        title: 'Pago único · Ana Pérez',
        amount: 550_000,
        status: 'OVERDUE',
        contactName: 'Ana Pérez',
        phone: '+573001234567',
      })

      const partialEvent = result.events.find(
        (e) => e.referenceId === 'loan-no-int'
      )
      expect(partialEvent).toMatchObject({
        date: '2026-11-18',
        type: 'LOAN_INSTALLMENT',
        title: 'Cuota 2/3 · Mateo Díaz',
        amount: 150_000, // remaining balance of the 200k installment
        status: 'PENDING',
        contactName: 'Mateo Díaz',
        phone: '+573109998877', // falls back to guarantor phone
      })

      const balloonEvent = result.events.find(
        (e) => e.referenceId === 'loan-balloon'
      )
      expect(balloonEvent).toMatchObject({
        date: '2026-11-05',
        type: 'LOAN_INSTALLMENT',
        amount: 50_000,
        status: 'PAID',
      })

      const decliningEvent = result.events.find(
        (e) => e.referenceId === 'loan-declining'
      )
      expect(decliningEvent).toMatchObject({
        date: '2026-11-28',
        type: 'LOAN_INSTALLMENT',
        amount: 432_000,
        status: 'PENDING',
      })

      // Expected: 550,000 + 200,000 + 50,000 + 432,000 = 1,232,000
      expect(result.summary.loansExpectedCollection).toBe(1_232_000)
      // Collected: 0 + 50,000 + 50,000 + 0 = 100,000
      expect(result.summary.loansCollected).toBe(100_000)
      // Active principal: 500,000 + (600,000 - 200,000) + 1,000,000 + 800,000 = 2,700,000
      expect(result.summary.activePrincipalTotal).toBe(2_700_000)
      expect(result.summary.overdueCount).toBe(1)
    })
  })

  describe('OPEN_ENDED loans projection', () => {
    it('projects monthly interest for OPEN_ENDED loans with interestRate > 0 on remainingPrincipal using monthlyBillingDay', () => {
      const contact = makeContact({ id: 'c-1', name: 'Andrés Ruiz' })

      const openWithInterest = makeLoan({
        id: 'loan-open-int',
        contactId: 'c-1',
        interestModel: 'OPEN_ENDED',
        interestRate: 5,
        principalAmount: 1_000_000,
        totalPrincipalDue: 1_000_000,
        paidPrincipal: 200_000, // remainingPrincipal = 800,000 -> 5% = 40,000
        totalInterestDue: 90_000,
        paidInterest: 50_000, // remaining current cycle interest = 40,000
        disbursementDate: '2026-09-12',
        monthlyBillingDay: 12,
        nextInterestDueDate: '2026-11-12',
        status: 'ACTIVE',
      })

      // Current unpaid cycle (Nov 2026, overdue as of Nov 20)
      const novData = buildMonthlyCalendarData({
        month: 11,
        year: 2026,
        services: [],
        servicePayments: [],
        loans: [openWithInterest],
        contacts: [contact],
        referenceDate: '2026-11-20',
      })

      expect(novData.events).toHaveLength(1)
      expect(novData.events[0]).toMatchObject({
        id: 'loan-open:loan-open-int:2026-11',
        date: '2026-11-12',
        type: 'LOAN_OPEN_INTEREST',
        title: 'Interés mensual · Andrés Ruiz',
        amount: 40_000,
        status: 'OVERDUE',
        referenceId: 'loan-open-int',
        contactName: 'Andrés Ruiz',
        phone: '+573001112233',
      })
      expect(novData.summary.loansExpectedCollection).toBe(40_000)
      expect(novData.summary.loansCollected).toBe(0)
      expect(novData.summary.activePrincipalTotal).toBe(800_000)
      expect(novData.summary.overdueCount).toBe(1)

      // Past cycle (Oct 2026) already covered since nextInterestDueDate is 2026-11-12
      const octData = buildMonthlyCalendarData({
        month: 10,
        year: 2026,
        services: [],
        servicePayments: [],
        loans: [openWithInterest],
        contacts: [contact],
        referenceDate: '2026-11-20',
      })

      expect(octData.events).toHaveLength(1)
      expect(octData.events[0]).toMatchObject({
        date: '2026-10-12',
        type: 'LOAN_OPEN_INTEREST',
        amount: 40_000,
        status: 'PAID',
      })
      expect(octData.summary.loansCollected).toBe(40_000)

      // Future projected cycle (Dec 2026)
      const decData = buildMonthlyCalendarData({
        month: 12,
        year: 2026,
        services: [],
        servicePayments: [],
        loans: [openWithInterest],
        contacts: [contact],
        referenceDate: '2026-11-20',
      })

      expect(decData.events).toHaveLength(1)
      expect(decData.events[0]).toMatchObject({
        date: '2026-12-12',
        type: 'LOAN_OPEN_INTEREST',
        amount: 40_000,
        status: 'PENDING',
      })

      // Disbursement month itself (Sep 2026, before first billing cycle Oct 2026) -> not projected
      const sepData = buildMonthlyCalendarData({
        month: 9,
        year: 2026,
        services: [],
        servicePayments: [],
        loans: [openWithInterest],
        contacts: [contact],
        referenceDate: '2026-11-20',
      })

      expect(sepData.events).toHaveLength(0)
    })

    it('strictly excludes OPEN_ENDED loans with interestRate === 0 from calendar events while still counting activePrincipalTotal', () => {
      const contact = makeContact({ id: 'c-zero', name: 'Sofía Castro' })

      const openZeroInterest = makeLoan({
        id: 'loan-open-zero',
        contactId: 'c-zero',
        interestModel: 'OPEN_ENDED',
        interestRate: 0,
        principalAmount: 1_500_000,
        totalPrincipalDue: 1_500_000,
        paidPrincipal: 300_000,
        disbursementDate: '2026-08-10',
        monthlyBillingDay: null,
        nextInterestDueDate: null,
        status: 'ACTIVE',
      })

      const result = buildMonthlyCalendarData({
        month: 11,
        year: 2026,
        services: [],
        servicePayments: [],
        loans: [openZeroInterest],
        contacts: [contact],
        referenceDate: '2026-11-20',
      })

      expect(result.events).toHaveLength(0)
      expect(result.summary.loansExpectedCollection).toBe(0)
      expect(result.summary.loansCollected).toBe(0)
      expect(result.summary.activePrincipalTotal).toBe(1_200_000)
      expect(result.summary.overdueCount).toBe(0)
    })

    it('handles partial interest payment in the current OPEN_ENDED cycle', () => {
      const contact = makeContact({ id: 'c-part', name: 'Diego Morales' })
      const loan = makeLoan({
        id: 'loan-open-partial',
        contactId: 'c-part',
        interestModel: 'OPEN_ENDED',
        interestRate: 10,
        principalAmount: 1_000_000,
        totalPrincipalDue: 1_000_000,
        paidPrincipal: 0,
        totalInterestDue: 100_000,
        paidInterest: 30_000, // 70,000 remaining in current cycle
        disbursementDate: '2026-10-25',
        monthlyBillingDay: 25,
        nextInterestDueDate: '2026-11-25',
        status: 'ACTIVE',
      })

      const result = buildMonthlyCalendarData({
        month: 11,
        year: 2026,
        services: [],
        servicePayments: [],
        loans: [loan],
        contacts: [contact],
        referenceDate: '2026-11-20',
      })

      expect(result.events[0]).toMatchObject({
        date: '2026-11-25',
        type: 'LOAN_OPEN_INTEREST',
        amount: 70_000,
        status: 'PENDING',
      })
      expect(result.summary.loansExpectedCollection).toBe(100_000)
      expect(result.summary.loansCollected).toBe(30_000)
    })
  })

  describe('combined KPIs, 7-day radar, and calendar grid', () => {
    it('computes combined DashboardSummary KPIs across services, scheduled loans, and OPEN_ENDED loans', () => {
      const contact = makeContact({ id: 'c-1', name: 'Paula Ortiz' })
      const services = [
        makeService({ id: 's-1', name: 'Luz', billingDay: 5 }),
        makeService({ id: 's-2', name: 'Gas', billingDay: 10 }),
        makeService({ id: 's-3', name: 'Internet', billingDay: 24 }),
      ]
      const servicePayments = [
        makeServicePayment({ serviceId: 's-1', period: '2026-11' }),
      ]
      const loans = [
        makeLoan({
          id: 'l-sched',
          contactId: 'c-1',
          interestModel: 'NO_INTEREST',
          principalAmount: 400_000,
          totalPrincipalDue: 400_000,
          paidPrincipal: 200_000,
          installments: [
            {
              installmentNumber: 1,
              dueDate: '2026-11-08',
              principalDue: 200_000,
              interestDue: 0,
              lateFeeDue: 0,
              paidAmount: 200_000,
              status: 'PAID',
            },
            {
              installmentNumber: 2,
              dueDate: '2026-11-22',
              principalDue: 200_000,
              interestDue: 0,
              lateFeeDue: 0,
              paidAmount: 0,
              status: 'PENDING',
            },
          ],
        }),
        makeLoan({
          id: 'l-open-rate',
          contactId: 'c-1',
          interestModel: 'OPEN_ENDED',
          interestRate: 5,
          principalAmount: 1_000_000,
          totalPrincipalDue: 1_000_000,
          totalInterestDue: 50_000,
          disbursementDate: '2026-10-12',
          monthlyBillingDay: 12,
          nextInterestDueDate: '2026-11-12',
        }),
        makeLoan({
          id: 'l-open-free',
          contactId: 'c-1',
          interestModel: 'OPEN_ENDED',
          interestRate: 0,
          principalAmount: 300_000,
          totalPrincipalDue: 300_000,
          disbursementDate: '2026-10-01',
        }),
      ]

      const result = buildMonthlyCalendarData({
        month: 11,
        year: 2026,
        services,
        servicePayments,
        loans,
        contacts: [contact],
        referenceDate: '2026-11-18',
      })

      expect(result.summary).toEqual({
        servicesTotalDue: 3,
        servicesPaid: 1,
        loansExpectedCollection: 450_000, // 200k + 200k + 50k
        loansCollected: 200_000,
        activePrincipalTotal: 1_500_000, // 200k + 1M + 300k
        overdueCount: 2, // Gas (Nov 10) + OPEN_ENDED interest (Nov 12)
      })
    })

    it('builds upcoming 7-day radar across month boundaries and computes upcoming3DaysCount', () => {
      const contact = makeContact({ id: 'c-1', name: 'Camila Vega' })
      const services = [
        makeService({ id: 's-today', name: 'Energía', billingDay: 28 }),
        makeService({ id: 's-next-month', name: 'Agua', billingDay: 2 }),
        makeService({ id: 's-far', name: 'Internet', billingDay: 15 }),
        makeService({ id: 's-paid-soon', name: 'Gas', billingDay: 29 }),
      ]
      const servicePayments = [
        makeServicePayment({ serviceId: 's-paid-soon', period: '2026-11' }),
      ]
      const loans = [
        makeLoan({
          id: 'l-dec-1',
          contactId: 'c-1',
          interestModel: 'SINGLE_PAYMENT',
          principalAmount: 250_000,
          totalPrincipalDue: 250_000,
          installments: [
            {
              installmentNumber: 1,
              dueDate: '2026-12-01',
              principalDue: 250_000,
              interestDue: 0,
              lateFeeDue: 0,
              paidAmount: 0,
              status: 'PENDING',
            },
          ],
        }),
      ]

      const radar = buildUpcomingEventsRadar({
        services,
        servicePayments,
        loans,
        contacts: [contact],
        referenceDate: '2026-11-28',
        days: 7,
      })

      expect(radar.upcomingEvents.map((e) => e.date)).toEqual([
        '2026-11-28',
        '2026-12-01',
        '2026-12-02',
      ])
      // 2026-11-28 + 3 days = 2026-12-01 -> includes Nov 28 and Dec 1
      expect(radar.upcoming3DaysCount).toBe(2)
    })

    it('generates a Monday-to-Sunday calendar grid matrix for any month', () => {
      // November 2026 starts on Sunday (2026-11-01) -> leading offset 6 days (Oct 26..31)
      const grid = buildMonthGridDays(2026, 11)
      expect(grid.length % 7).toBe(0)
      expect(grid[0]).toEqual({
        isoDate: '2026-10-26',
        dayNumber: 26,
        isCurrentMonth: false,
      })
      expect(grid[6]).toEqual({
        isoDate: '2026-11-01',
        dayNumber: 1,
        isCurrentMonth: true,
      })
      expect(grid.filter((d) => d.isCurrentMonth)).toHaveLength(30)
    })
  })

  describe('getDashboardOverviewUseCase', () => {
    it('orchestrates services, loans, and contacts repositories in parallel', async () => {
      const serviceRepository = {
        findByUserId: vi
          .fn()
          .mockResolvedValue([makeService({ id: 's-1', billingDay: 22 })]),
        findPaymentsByUserId: vi.fn().mockResolvedValue([]),
      } as unknown as IServiceRepository

      const loanRepository = {
        findByUserId: vi.fn().mockResolvedValue([
          makeLoan({
            id: 'l-1',
            contactId: 'c-1',
            interestModel: 'OPEN_ENDED',
            interestRate: 5,
            principalAmount: 500_000,
            totalPrincipalDue: 500_000,
            totalInterestDue: 25_000,
            disbursementDate: '2026-10-24',
            monthlyBillingDay: 24,
            nextInterestDueDate: '2026-11-24',
          }),
        ]),
      } as unknown as ILoanRepository

      const contactRepository = {
        findByUserId: vi
          .fn()
          .mockResolvedValue([makeContact({ id: 'c-1', name: 'Luis Nieto' })]),
      } as unknown as IContactRepository

      const overview = await getDashboardOverviewUseCase('user-1', {
        serviceRepository,
        loanRepository,
        contactRepository,
        referenceDate: '2026-11-21',
      })

      expect(serviceRepository.findByUserId).toHaveBeenCalledWith('user-1')
      expect(serviceRepository.findPaymentsByUserId).toHaveBeenCalledWith(
        'user-1'
      )
      expect(loanRepository.findByUserId).toHaveBeenCalledWith('user-1')
      expect(contactRepository.findByUserId).toHaveBeenCalledWith('user-1')

      expect(overview.initialCalendar.period).toBe('2026-11')
      expect(overview.initialCalendar.events).toHaveLength(2)
      expect(overview.initialCalendar.summary.servicesTotalDue).toBe(1)
      expect(overview.initialCalendar.summary.loansExpectedCollection).toBe(
        25_000
      )
      expect(overview.upcomingEvents).toHaveLength(2)
      expect(overview.upcoming3DaysCount).toBe(2) // Nov 22 + Nov 24 within 3 days of Nov 21
    })
  })
})
