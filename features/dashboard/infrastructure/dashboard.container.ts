import 'server-only'

import { firestoreContactRepository } from '@/features/contacts/infrastructure/firestore-contact.repository'
import { getDashboardOverviewUseCase } from '@/features/dashboard/application/get-dashboard-overview.use-case'
import type { DashboardOverview } from '@/features/dashboard/domain/dashboard.types'
import { firestoreLoanRepository } from '@/features/loans/infrastructure/firestore-loan.repository'
import { firestoreServiceRepository } from '@/features/services/infrastructure/firestore-service.repository'

export interface GetDashboardOverviewOptions {
  month?: number
  year?: number
  referenceDate?: Date | string
}

/**
 * Composition root for the `dashboard` feature.
 * Binds application use cases to concrete Firestore repositories.
 */
export const dashboardContainer = {
  getDashboardOverview(
    userId: string,
    options: GetDashboardOverviewOptions = {}
  ): Promise<DashboardOverview> {
    return getDashboardOverviewUseCase(userId, {
      serviceRepository: firestoreServiceRepository,
      loanRepository: firestoreLoanRepository,
      contactRepository: firestoreContactRepository,
      month: options.month,
      year: options.year,
      referenceDate: options.referenceDate,
    })
  },
}
