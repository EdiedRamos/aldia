import type { Contact } from '@/features/contacts/domain/contact.entity'
import type { Loan } from '@/features/loans/domain/loan.entity'
import type {
  Service,
  ServicePayment,
} from '@/features/services/domain/service.entity'

export type CalendarEventType =
  'SERVICE_DUE' | 'LOAN_INSTALLMENT' | 'LOAN_OPEN_INTEREST'

export type CalendarEventStatus = 'PENDING' | 'PAID' | 'OVERDUE'

export interface CalendarEventItem {
  id: string
  date: string // YYYY-MM-DD
  type: CalendarEventType
  title: string
  subtitle: string
  amount: number | null
  status: CalendarEventStatus
  referenceId: string
  contactName?: string
  phone?: string
}

export interface DashboardSummary {
  servicesTotalDue: number
  servicesPaid: number
  loansExpectedCollection: number
  loansCollected: number
  activePrincipalTotal: number
  overdueCount: number
}

export interface MonthlyCalendarData {
  month: number // 1-12
  year: number
  period: string // YYYY-MM
  todayIso: string // YYYY-MM-DD
  events: CalendarEventItem[]
  summary: DashboardSummary
}

export interface CalendarGridDay {
  isoDate: string // YYYY-MM-DD
  dayNumber: number
  isCurrentMonth: boolean
}

export interface DashboardSourceData {
  services: Service[]
  servicePayments: ServicePayment[]
  loans: Loan[]
  contacts: Contact[]
}

export interface DashboardOverview {
  initialCalendar: MonthlyCalendarData
  upcomingEvents: CalendarEventItem[]
  upcoming3DaysCount: number
  sourceData: DashboardSourceData
}
