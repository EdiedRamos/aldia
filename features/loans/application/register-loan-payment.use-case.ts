import { randomUUID } from 'node:crypto'

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
import {
  registerLoanPaymentSchema,
  type RegisterLoanPaymentInput,
} from '@/features/loans/domain/loan.schemas'
import { applyPaymentToLoan } from '@/features/loans/domain/loan-schedule.calculator'

export interface RegisterLoanPaymentUseCaseInput extends RegisterLoanPaymentInput {
  receipt?: LoanReceiptUploadInput | null
}

export interface RegisterLoanPaymentDependencies {
  loanRepository: ILoanRepository
  loanReceiptStorage: ILoanReceiptStorage
  generatePaymentId?: () => string
  now?: () => Date
}

export interface RegisterLoanPaymentResult {
  loan: Loan
  payment: LoanPayment
}

export async function registerLoanPaymentUseCase(
  userId: string,
  rawInput: RegisterLoanPaymentUseCaseInput,
  {
    loanRepository,
    loanReceiptStorage,
    generatePaymentId = () =>
      `pay_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    now = () => new Date(),
  }: RegisterLoanPaymentDependencies
): Promise<RegisterLoanPaymentResult> {
  const { receipt, ...paymentPayload } = rawInput
  const parsed = registerLoanPaymentSchema.parse(paymentPayload)

  const validatedReceipt = receipt
    ? validateLoanReceiptFile({
        sizeBytes: receipt.buffer.byteLength,
        contentType: receipt.contentType,
        fileName: receipt.fileName,
        extension: receipt.extension,
      })
    : null

  const existingLoan = await loanRepository.findById(parsed.loanId, userId)
  if (!existingLoan) {
    throw new LoanDomainError(
      'LOAN_NOT_FOUND',
      `Loan ${parsed.loanId} not found for user ${userId}`,
      'El préstamo no existe o no tienes acceso a él.'
    )
  }

  const paymentId = generatePaymentId()
  const paidAt = parsed.paidAt ?? now().toISOString()

  // Compute and validate payment allocation before uploading any receipt
  const initialApplication = applyPaymentToLoan(existingLoan, parsed.amount, {
    id: paymentId,
    paidAt,
    receiptPath: null,
    notes: parsed.notes,
  })

  let uploadedReceiptPath: string | null = null
  if (receipt && validatedReceipt) {
    const uploaded = await loanReceiptStorage.uploadReceipt({
      userId,
      loanId: existingLoan.id,
      filePrefix: `payment-${paymentId}`,
      buffer: receipt.buffer,
      contentType: validatedReceipt.contentType,
      extension: validatedReceipt.extension,
    })
    uploadedReceiptPath = uploaded.receiptPath
  }

  const finalPayment: LoanPayment = {
    ...initialApplication.payment,
    receiptPath: uploadedReceiptPath,
  }
  const finalPayments: LoanPayment[] = initialApplication.payments.map(
    (item) => (item.id === finalPayment.id ? finalPayment : item)
  )

  try {
    const updatedLoan = await loanRepository.update(existingLoan.id, userId, {
      installments: initialApplication.installments,
      payments: finalPayments,
      paidPrincipal: initialApplication.paidPrincipal,
      paidInterest: initialApplication.paidInterest,
      totalInterestDue: initialApplication.totalInterestDue,
      nextInterestDueDate: initialApplication.nextInterestDueDate,
      status: initialApplication.status,
    })

    return {
      loan: updatedLoan,
      payment: finalPayment,
    }
  } catch (error) {
    if (uploadedReceiptPath) {
      await loanReceiptStorage
        .deleteReceipt(uploadedReceiptPath)
        .catch(() => undefined)
    }
    throw error
  }
}
