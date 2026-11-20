import { LoanDomainError, type Loan } from '@/features/loans/domain/loan.entity'
import type { ILoanRepository } from '@/features/loans/domain/loan.repository'
import {
  updateInstallmentSchema,
  type UpdateInstallmentInput,
} from '@/features/loans/domain/loan.schemas'
import { applyInstallmentUpdate } from '@/features/loans/domain/loan-schedule.calculator'

export interface UpdateInstallmentDependencies {
  loanRepository: ILoanRepository
}

export async function updateInstallmentUseCase(
  userId: string,
  rawInput: UpdateInstallmentInput,
  { loanRepository }: UpdateInstallmentDependencies
): Promise<Loan> {
  const parsed = updateInstallmentSchema.parse(rawInput)

  const existingLoan = await loanRepository.findById(parsed.loanId, userId)
  if (!existingLoan) {
    throw new LoanDomainError(
      'LOAN_NOT_FOUND',
      `Loan ${parsed.loanId} not found for user ${userId}`,
      'El préstamo no existe o no tienes acceso a él.'
    )
  }

  const updatedInstallments = applyInstallmentUpdate(
    existingLoan,
    parsed.installmentNumber,
    {
      dueDate: parsed.dueDate,
      lateFeeDue: parsed.lateFeeDue,
    }
  )

  return loanRepository.update(existingLoan.id, userId, {
    installments: updatedInstallments,
  })
}
