import {
  LoanDomainError,
  roundCurrency,
  type Loan,
} from '@/features/loans/domain/loan.entity'
import type { ILoanRepository } from '@/features/loans/domain/loan.repository'
import {
  refinanceLoanSchema,
  type RefinanceLoanInput,
} from '@/features/loans/domain/loan.schemas'
import {
  buildScheduleFromCustomInstallments,
  calculateLoanSchedule,
} from '@/features/loans/domain/loan-schedule.calculator'

export interface RefinanceLoanDependencies {
  loanRepository: ILoanRepository
}

export interface RefinanceLoanResult {
  previousLoan: Loan
  newLoan: Loan
}

export async function refinanceLoanUseCase(
  userId: string,
  rawInput: RefinanceLoanInput,
  { loanRepository }: RefinanceLoanDependencies
): Promise<RefinanceLoanResult> {
  const parsed = refinanceLoanSchema.parse(rawInput)

  const currentLoan = await loanRepository.findById(parsed.loanId, userId)
  if (!currentLoan) {
    throw new LoanDomainError(
      'LOAN_NOT_FOUND',
      `Loan ${parsed.loanId} not found for user ${userId}`,
      'El préstamo a refinanciar no existe o no tienes acceso a él.'
    )
  }

  if (currentLoan.status !== 'ACTIVE') {
    throw new LoanDomainError(
      'LOAN_NOT_ACTIVE',
      `Cannot refinance loan with status ${currentLoan.status}`,
      'Solo se pueden refinanciar préstamos que estén activos.'
    )
  }

  const schedule =
    parsed.interestModel === 'OPEN_ENDED'
      ? calculateLoanSchedule({
          principalAmount: parsed.principalAmount,
          interestRate: parsed.interestRate,
          interestModel: 'OPEN_ENDED',
          disbursementDate: parsed.disbursementDate,
          monthlyBillingDay: parsed.monthlyBillingDay,
        })
      : parsed.installments && parsed.installments.length > 0
        ? buildScheduleFromCustomInstallments(
            parsed.interestModel,
            parsed.interestRate,
            parsed.installments
          )
        : calculateLoanSchedule({
            principalAmount: parsed.principalAmount,
            interestRate: parsed.interestRate,
            interestModel: parsed.interestModel,
            disbursementDate: parsed.disbursementDate,
            installmentCount: parsed.installmentCount,
            dueDates: parsed.dueDates,
          })

  // Freeze current loan history intact as REFINANCED
  const previousLoan = await loanRepository.update(currentLoan.id, userId, {
    status: 'REFINANCED',
  })

  try {
    const newLoan = await loanRepository.create({
      userId,
      contactId: currentLoan.contactId,
      direction: 'LENT',
      principalAmount: roundCurrency(schedule.totalPrincipalDue),
      interestRate: schedule.interestRate,
      interestModel: parsed.interestModel,
      totalPrincipalDue: schedule.totalPrincipalDue,
      totalInterestDue: schedule.totalInterestDue,
      paidPrincipal: 0,
      paidInterest: 0,
      installments: schedule.installments,
      payments: [],
      disbursementDate: parsed.disbursementDate,
      disbursementReceiptPath: null,
      monthlyBillingDay: schedule.monthlyBillingDay,
      nextInterestDueDate: schedule.nextInterestDueDate,
      status: 'ACTIVE',
      parentLoanId: currentLoan.id,
      notes: parsed.notes,
    })

    return {
      previousLoan,
      newLoan,
    }
  } catch (error) {
    // Best-effort rollback of previous loan status if creating the successor fails
    await loanRepository
      .update(currentLoan.id, userId, { status: 'ACTIVE' })
      .catch(() => undefined)
    throw error
  }
}
