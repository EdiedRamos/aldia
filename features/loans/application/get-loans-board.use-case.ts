import type { Contact } from '@/features/contacts/domain/contact.entity'
import type { IContactRepository } from '@/features/contacts/domain/contact.repository'
import {
  getLoanTotals,
  roundCurrency,
  type Loan,
  type LoanEffectiveStatus,
  type LoanTotals,
} from '@/features/loans/domain/loan.entity'
import type { ILoanRepository } from '@/features/loans/domain/loan.repository'
import {
  evaluateLoanEffectiveStatus,
  formatReferenceDateToIsoDate,
  getOpenEndedCurrentInterestDue,
  requiresLoanReminder,
  type EvaluatedLoanStatus,
} from '@/features/loans/domain/loan-schedule.calculator'

export interface LoanContactSummary {
  id: string
  name: string
  phone: string | null
  guarantorContactId: string | null
  status: Contact['status']
}

export interface LoanGuarantorSummary {
  id: string
  name: string
  phone: string | null
}

export interface EnrichedLoan extends Loan, EvaluatedLoanStatus {
  contact: LoanContactSummary
  guarantorContact: LoanGuarantorSummary | null
  effectivePhone: string | null
  isViaIntermediary: boolean
  totals: LoanTotals
  currentCycleInterestDue: number
  requiresReminder: boolean
}

export interface LoansBoardSummary {
  activePrincipalToCollect: number
  activeInterestToCollect: number
  totalRecovered: number
  overdueLoansCount: number
  overdueAmount: number
  activeLoansCount: number
  openEndedLoansCount: number
  paidLoansCount: number
  refinancedLoansCount: number
  archivedLoansCount: number
}

export interface LoansBoard {
  loans: EnrichedLoan[]
  summary: LoansBoardSummary
}

export interface GetLoansBoardDependencies {
  loanRepository: ILoanRepository
  contactRepository: IContactRepository
  referenceDate?: Date | string
}

const EFFECTIVE_STATUS_PRIORITY: Record<LoanEffectiveStatus, number> = {
  OVERDUE: 0,
  ACTIVE: 1,
  OPEN_ENDED: 2,
  PAID: 3,
  REFINANCED: 4,
  ARCHIVED: 5,
}

function computeLoanOverdueAmount(loan: Loan, todayIso: string): number {
  if (loan.status !== 'ACTIVE') {
    return 0
  }

  if (loan.interestModel === 'OPEN_ENDED') {
    if (
      loan.interestRate > 0 &&
      loan.nextInterestDueDate &&
      loan.nextInterestDueDate < todayIso
    ) {
      return roundCurrency(
        Math.max(0, loan.totalInterestDue - loan.paidInterest)
      )
    }
    return 0
  }

  return roundCurrency(
    loan.installments
      .filter((inst) => inst.status !== 'PAID' && inst.dueDate < todayIso)
      .reduce((acc, inst) => {
        const instTotal = roundCurrency(
          inst.principalDue + inst.interestDue + inst.lateFeeDue
        )
        const remaining = roundCurrency(
          Math.max(0, instTotal - inst.paidAmount)
        )
        return acc + remaining
      }, 0)
  )
}

export async function getLoansBoardUseCase(
  userId: string,
  {
    loanRepository,
    contactRepository,
    referenceDate = new Date(),
  }: GetLoansBoardDependencies
): Promise<LoansBoard> {
  const [loans, contacts] = await Promise.all([
    loanRepository.findByUserId(userId),
    contactRepository.findByUserId(userId),
  ])

  const contactsById = new Map<string, Contact>()
  for (const contact of contacts) {
    contactsById.set(contact.id, contact)
  }

  const todayIso = formatReferenceDateToIsoDate(referenceDate)

  const enrichedLoans: EnrichedLoan[] = loans
    .map((loan) => {
      const contactRecord = contactsById.get(loan.contactId)
      const contact: LoanContactSummary = contactRecord
        ? {
            id: contactRecord.id,
            name: contactRecord.name,
            phone: contactRecord.phone,
            guarantorContactId: contactRecord.guarantorContactId,
            status: contactRecord.status,
          }
        : {
            id: loan.contactId,
            name: 'Contacto eliminado',
            phone: null,
            guarantorContactId: null,
            status: 'ARCHIVED',
          }

      const guarantorRecord = contact.guarantorContactId
        ? contactsById.get(contact.guarantorContactId)
        : undefined

      const guarantorContact: LoanGuarantorSummary | null = guarantorRecord
        ? {
            id: guarantorRecord.id,
            name: guarantorRecord.name,
            phone: guarantorRecord.phone,
          }
        : null

      const isViaIntermediary = !contact.phone && Boolean(guarantorContact)
      const effectivePhone = contact.phone ?? guarantorContact?.phone ?? null

      const evaluated = evaluateLoanEffectiveStatus(loan, referenceDate)
      const totals = getLoanTotals(loan)
      const currentCycleInterestDue = getOpenEndedCurrentInterestDue(loan)
      const requiresReminder = requiresLoanReminder(loan)

      return {
        ...loan,
        ...evaluated,
        contact,
        guarantorContact,
        effectivePhone,
        isViaIntermediary,
        totals,
        currentCycleInterestDue,
        requiresReminder,
      }
    })
    .sort((a, b) => {
      const priorityDiff =
        EFFECTIVE_STATUS_PRIORITY[a.effectiveStatus] -
        EFFECTIVE_STATUS_PRIORITY[b.effectiveStatus]
      if (priorityDiff !== 0) {
        return priorityDiff
      }

      if (a.effectiveStatus === 'OVERDUE' && b.effectiveStatus === 'OVERDUE') {
        return b.overdueDays - a.overdueDays
      }

      if (a.nextInstallment && b.nextInstallment) {
        const dueDiff = a.nextInstallment.dueDate.localeCompare(
          b.nextInstallment.dueDate
        )
        if (dueDiff !== 0) {
          return dueDiff
        }
      }

      return String(b.createdAt).localeCompare(String(a.createdAt))
    })

  let activePrincipalToCollect = 0
  let activeInterestToCollect = 0
  let totalRecovered = 0
  let overdueLoansCount = 0
  let overdueAmount = 0
  let activeLoansCount = 0
  let openEndedLoansCount = 0
  let paidLoansCount = 0
  let refinancedLoansCount = 0
  let archivedLoansCount = 0

  for (const loan of enrichedLoans) {
    if (loan.status !== 'ARCHIVED') {
      totalRecovered = roundCurrency(totalRecovered + loan.totals.totalPaid)
    }

    if (loan.status === 'ACTIVE') {
      activeLoansCount += 1
      activePrincipalToCollect = roundCurrency(
        activePrincipalToCollect + loan.totals.remainingPrincipal
      )
      activeInterestToCollect = roundCurrency(
        activeInterestToCollect +
          loan.totals.remainingInterest +
          loan.totals.remainingLateFee
      )
    }

    if (loan.effectiveStatus === 'OVERDUE') {
      overdueLoansCount += 1
      overdueAmount = roundCurrency(
        overdueAmount + computeLoanOverdueAmount(loan, todayIso)
      )
      if (loan.interestModel === 'OPEN_ENDED') {
        openEndedLoansCount += 1
      }
    } else if (loan.effectiveStatus === 'OPEN_ENDED') {
      openEndedLoansCount += 1
    } else if (loan.status === 'PAID') {
      paidLoansCount += 1
    } else if (loan.status === 'REFINANCED') {
      refinancedLoansCount += 1
    } else if (loan.status === 'ARCHIVED') {
      archivedLoansCount += 1
    }
  }

  return {
    loans: enrichedLoans,
    summary: {
      activePrincipalToCollect,
      activeInterestToCollect,
      totalRecovered,
      overdueLoansCount,
      overdueAmount,
      activeLoansCount,
      openEndedLoansCount,
      paidLoansCount,
      refinancedLoansCount,
      archivedLoansCount,
    },
  }
}
