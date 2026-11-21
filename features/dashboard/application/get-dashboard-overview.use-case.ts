import type { IContactRepository } from '@/features/contacts/domain/contact.repository'
import {
  buildMonthlyCalendarData,
  buildUpcomingEventsRadar,
} from '@/features/dashboard/domain/calendar-aggregator'
import type { DashboardOverview } from '@/features/dashboard/domain/dashboard.types'
import type {
  ILoanRepository,
  ILoanSettingsRepository,
} from '@/features/loans/domain/loan.repository'
import { formatReferenceDateToIsoDate } from '@/features/loans/domain/loan-schedule.calculator'
import { DEFAULT_WHATSAPP_TEMPLATES } from '@/features/loans/domain/loan-whatsapp-template'
import type { IServiceRepository } from '@/features/services/domain/service.repository'

export interface GetDashboardOverviewDependencies {
  serviceRepository: IServiceRepository
  loanRepository: ILoanRepository
  contactRepository: IContactRepository
  loanSettingsRepository?: ILoanSettingsRepository
  referenceDate?: Date | string
  month?: number
  year?: number
}

/**
 * Orchestrates the `services`, `loans`, and `contacts` repositories for the authenticated
 * user to assemble the monthly dashboard calendar overview, KPI summary, and 7-day radar.
 */
export async function getDashboardOverviewUseCase(
  userId: string,
  {
    serviceRepository,
    loanRepository,
    contactRepository,
    loanSettingsRepository,
    referenceDate = new Date(),
    month,
    year,
  }: GetDashboardOverviewDependencies
): Promise<DashboardOverview> {
  const [services, servicePayments, loans, contacts, whatsAppTemplates] =
    await Promise.all([
      serviceRepository.findByUserId(userId),
      serviceRepository.findPaymentsByUserId(userId),
      loanRepository.findByUserId(userId),
      contactRepository.findByUserId(userId),
      loanSettingsRepository
        ? loanSettingsRepository.getWhatsAppTemplates(userId)
        : Promise.resolve({ ...DEFAULT_WHATSAPP_TEMPLATES }),
    ])

  const todayIso = formatReferenceDateToIsoDate(referenceDate)
  const [currentYear, currentMonth] = todayIso.split('-').map(Number)

  const targetMonth = month ?? currentMonth
  const targetYear = year ?? currentYear

  const initialCalendar = buildMonthlyCalendarData({
    month: targetMonth,
    year: targetYear,
    services,
    servicePayments,
    loans,
    contacts,
    referenceDate: todayIso,
  })

  const { upcomingEvents, upcoming3DaysCount } = buildUpcomingEventsRadar({
    services,
    servicePayments,
    loans,
    contacts,
    referenceDate: todayIso,
    days: 7,
  })

  return {
    initialCalendar,
    upcomingEvents,
    upcoming3DaysCount,
    sourceData: {
      services,
      servicePayments,
      loans,
      contacts,
    },
    whatsAppTemplates,
  }
}
