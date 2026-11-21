import {
  LoanDomainError,
  type Loan,
  type LoanPayment,
} from '@/features/loans/domain/loan.entity'
import type { ILoanRepository } from '@/features/loans/domain/loan.repository'
import { voidLoanPaymentSchema } from '@/features/loans/domain/loan.schemas'
import { voidPaymentOnLoan } from '@/features/loans/domain/loan-schedule.calculator'

export interface VoidLoanPaymentUseCaseInput {
  userId: string
  loanId: string
  paymentId: string
  reason: string
}

export interface VoidLoanPaymentDependencies {
  loanRepository: ILoanRepository
  now?: () => Date
}

export interface VoidLoanPaymentResult {
  loan: Loan
  voidedPayment: LoanPayment
}

/**
 * Voids a previously applied loan payment for audit-safe error correction:
 * preserves the payment entry and its immutable `receiptPath`, records the
 * mandatory void reason, and deterministically recalculates balances,
 * installments, and global loan status (`PAID` -> `ACTIVE`).
 */
export async function voidLoanPaymentUseCase(
  input: VoidLoanPaymentUseCaseInput,
  { loanRepository, now = () => new Date() }: VoidLoanPaymentDependencies
): Promise<VoidLoanPaymentResult> {
  const userId = input.userId.trim()
  if (!userId) {
    throw new Error('Unauthorized: userId is required')
  }

  const parsed = voidLoanPaymentSchema.parse({
    loanId: input.loanId,
    paymentId: input.paymentId,
    reason: input.reason,
  })

  const existingLoan = await loanRepository.findById(parsed.loanId, userId)
  if (!existingLoan) {
    throw new LoanDomainError(
      'LOAN_NOT_FOUND',
      `Loan ${parsed.loanId} not found for user ${userId}`,
      'El préstamo no existe o no tienes acceso a él.'
    )
  }

  const recalculated = voidPaymentOnLoan(
    existingLoan,
    parsed.paymentId,
    parsed.reason,
    now().toISOString()
  )

  const updatedLoan = await loanRepository.update(existingLoan.id, userId, {
    installments: recalculated.installments,
    payments: recalculated.payments,
    paidPrincipal: recalculated.paidPrincipal,
    paidInterest: recalculated.paidInterest,
    totalInterestDue: recalculated.totalInterestDue,
    nextInterestDueDate: recalculated.nextInterestDueDate,
    status: recalculated.status,
  })

  return {
    loan: updatedLoan,
    voidedPayment: recalculated.voidedPayment,
  }
}
