import type { LoanReceiptUploadInput } from '@/features/loans/application/create-loan.use-case'
import { LoanDomainError, type Loan } from '@/features/loans/domain/loan.entity'
import { validateLoanReceiptFile } from '@/features/loans/domain/loan.policy'
import type {
  ILoanReceiptStorage,
  ILoanRepository,
} from '@/features/loans/domain/loan.repository'

export interface AttachLoanDisbursementReceiptInput {
  loanId: string
  receipt: LoanReceiptUploadInput
}

export interface AttachLoanDisbursementReceiptDependencies {
  loanRepository: ILoanRepository
  loanReceiptStorage: ILoanReceiptStorage
}

/**
 * Attaches a disbursement receipt to a loan that was created without one.
 * Once saved, disbursement receipts are strictly immutable and cannot be replaced or overwritten.
 */
export async function attachLoanDisbursementReceiptUseCase(
  userId: string,
  input: AttachLoanDisbursementReceiptInput,
  {
    loanRepository,
    loanReceiptStorage,
  }: AttachLoanDisbursementReceiptDependencies
): Promise<Loan> {
  const loanId = input.loanId.trim()
  if (!loanId) {
    throw new LoanDomainError(
      'LOAN_NOT_FOUND',
      'Loan ID is required to attach disbursement receipt',
      'El ID del préstamo es obligatorio.'
    )
  }

  const validatedReceipt = validateLoanReceiptFile({
    sizeBytes: input.receipt.buffer.byteLength,
    contentType: input.receipt.contentType,
    fileName: input.receipt.fileName,
    extension: input.receipt.extension,
  })

  const existingLoan = await loanRepository.findById(loanId, userId)
  if (!existingLoan) {
    throw new LoanDomainError(
      'LOAN_NOT_FOUND',
      `Loan ${loanId} not found for user ${userId}`,
      'El préstamo no existe o no tienes acceso a él.'
    )
  }

  if (existingLoan.disbursementReceiptPath) {
    throw new LoanDomainError(
      'RECEIPT_ALREADY_EXISTS',
      `Disbursement receipt already exists for loan ${loanId} and is immutable`,
      'Este préstamo ya tiene un comprobante de desembolso guardado y no puede editarse ni reemplazarse.'
    )
  }

  const uploaded = await loanReceiptStorage.uploadReceipt({
    userId,
    loanId: existingLoan.id,
    filePrefix: 'disbursement',
    buffer: input.receipt.buffer,
    contentType: validatedReceipt.contentType,
    extension: validatedReceipt.extension,
  })

  try {
    return await loanRepository.update(existingLoan.id, userId, {
      disbursementReceiptPath: uploaded.receiptPath,
    })
  } catch (error) {
    await loanReceiptStorage
      .deleteReceipt(uploaded.receiptPath)
      .catch(() => undefined)
    throw error
  }
}
