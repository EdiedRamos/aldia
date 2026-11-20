import { LoanDomainError, type Loan } from '@/features/loans/domain/loan.entity'
import type { ILoanRepository } from '@/features/loans/domain/loan.repository'

export interface ArchiveLoanDependencies {
  loanRepository: ILoanRepository
}

export async function archiveLoanUseCase(
  loanId: string,
  userId: string,
  { loanRepository }: ArchiveLoanDependencies
): Promise<Loan> {
  const existing = await loanRepository.findById(loanId, userId)
  if (!existing) {
    throw new LoanDomainError(
      'LOAN_NOT_FOUND',
      `Loan ${loanId} not found for user ${userId}`,
      'El préstamo no existe o no tienes acceso a él.'
    )
  }

  return loanRepository.update(loanId, userId, {
    status: 'ARCHIVED',
  })
}
