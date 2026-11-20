import {
  isOwnedLoanReceiptPath,
  LOAN_RECEIPT_SIGNED_URL_TTL_SECONDS,
  LoanReceiptPolicyError,
} from '@/features/loans/domain/loan.policy'
import type { ILoanReceiptStorage } from '@/features/loans/domain/loan.repository'

export interface GetLoanReceiptPreviewInput {
  userId: string
  receiptPath: string
  expiresInSeconds?: number
}

export interface GetLoanReceiptPreviewDependencies {
  loanReceiptStorage: ILoanReceiptStorage
}

/**
 * Generates a short-lived signed read URL for a loan receipt (disbursement or payment)
 * after strictly verifying that `receiptPath` belongs to the authenticated user.
 */
export async function getLoanReceiptPreviewUseCase(
  input: GetLoanReceiptPreviewInput,
  { loanReceiptStorage }: GetLoanReceiptPreviewDependencies
): Promise<string> {
  const userId = input.userId.trim()
  const receiptPath = input.receiptPath.trim()

  if (!userId) {
    throw new Error('Unauthorized: userId is required')
  }

  if (!receiptPath) {
    throw new LoanReceiptPolicyError(
      'FORBIDDEN_RECEIPT_PATH',
      'Invalid receiptPath: path cannot be empty',
      'La ruta del comprobante es inválida.'
    )
  }

  if (!isOwnedLoanReceiptPath(userId, receiptPath)) {
    throw new LoanReceiptPolicyError(
      'FORBIDDEN_RECEIPT_PATH',
      'Forbidden: loan receipt does not belong to the authenticated user',
      'No tienes permiso para ver este comprobante.'
    )
  }

  const expiresInSeconds =
    input.expiresInSeconds ?? LOAN_RECEIPT_SIGNED_URL_TTL_SECONDS

  return loanReceiptStorage.getReceiptReadUrl(receiptPath, expiresInSeconds)
}
