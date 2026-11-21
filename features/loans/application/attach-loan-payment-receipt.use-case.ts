import type { LoanReceiptUploadInput } from '@/features/loans/application/create-loan.use-case'
import {
  LoanDomainError,
  type Loan,
  type LoanPayment,
} from '@/features/loans/domain/loan.entity'
import { validateLoanReceiptFile } from '@/features/loans/domain/loan.policy'
import type {
  ILoanReceiptStorage,
  ILoanRepository,
} from '@/features/loans/domain/loan.repository'

export interface AttachLoanPaymentReceiptInput {
  loanId: string
  paymentId: string
  receipt: LoanReceiptUploadInput
}

export interface AttachLoanPaymentReceiptDependencies {
  loanRepository: ILoanRepository
  loanReceiptStorage: ILoanReceiptStorage
}

export interface AttachLoanPaymentReceiptResult {
  loan: Loan
  payment: LoanPayment
}

/**
 * Attaches a receipt to a registered loan payment that was originally recorded without one.
 * Once saved, payment receipts are strictly immutable and cannot be replaced or overwritten.
 */
export async function attachLoanPaymentReceiptUseCase(
  userId: string,
  input: AttachLoanPaymentReceiptInput,
  { loanRepository, loanReceiptStorage }: AttachLoanPaymentReceiptDependencies
): Promise<AttachLoanPaymentReceiptResult> {
  const loanId = input.loanId.trim()
  const paymentId = input.paymentId.trim()

  if (!loanId) {
    throw new LoanDomainError(
      'LOAN_NOT_FOUND',
      'Loan ID is required to attach payment receipt',
      'El ID del préstamo es obligatorio.'
    )
  }

  if (!paymentId) {
    throw new LoanDomainError(
      'PAYMENT_NOT_FOUND',
      'Payment ID is required to attach payment receipt',
      'El ID del abono es obligatorio.'
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

  const targetIndex = existingLoan.payments.findIndex(
    (payment) => payment.id === paymentId
  )
  if (targetIndex === -1) {
    throw new LoanDomainError(
      'PAYMENT_NOT_FOUND',
      `Payment ${paymentId} not found in loan ${loanId}`,
      'No se encontró el abono especificado en este préstamo.'
    )
  }

  const targetPayment = existingLoan.payments[targetIndex]
  if (targetPayment.receiptPath) {
    throw new LoanDomainError(
      'RECEIPT_ALREADY_EXISTS',
      `Receipt already exists for payment ${paymentId} on loan ${loanId} and is immutable`,
      'Este abono ya tiene un comprobante guardado y no puede editarse ni reemplazarse.'
    )
  }

  const uploaded = await loanReceiptStorage.uploadReceipt({
    userId,
    loanId: existingLoan.id,
    filePrefix: `payment-${paymentId}`,
    buffer: input.receipt.buffer,
    contentType: validatedReceipt.contentType,
    extension: validatedReceipt.extension,
  })

  const updatedPayment: LoanPayment = {
    ...targetPayment,
    receiptPath: uploaded.receiptPath,
  }
  const updatedPayments = existingLoan.payments.map((payment, index) =>
    index === targetIndex ? updatedPayment : payment
  )

  try {
    const updatedLoan = await loanRepository.update(existingLoan.id, userId, {
      payments: updatedPayments,
    })

    return {
      loan: updatedLoan,
      payment: updatedPayment,
    }
  } catch (error) {
    await loanReceiptStorage
      .deleteReceipt(uploaded.receiptPath)
      .catch(() => undefined)
    throw error
  }
}
