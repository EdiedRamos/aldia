import type { IContactRepository } from '@/features/contacts/domain/contact.repository'
import {
  LoanDomainError,
  roundCurrency,
  type Loan,
} from '@/features/loans/domain/loan.entity'
import { validateLoanReceiptFile } from '@/features/loans/domain/loan.policy'
import type {
  ILoanReceiptStorage,
  ILoanRepository,
} from '@/features/loans/domain/loan.repository'
import {
  createLoanSchema,
  type CreateLoanInput,
} from '@/features/loans/domain/loan.schemas'
import {
  buildScheduleFromCustomInstallments,
  calculateLoanSchedule,
} from '@/features/loans/domain/loan-schedule.calculator'

export interface LoanReceiptUploadInput {
  buffer: Buffer
  contentType: string
  fileName?: string
  extension?: string
}

export interface CreateLoanUseCaseInput extends CreateLoanInput {
  disbursementReceipt?: LoanReceiptUploadInput | null
}

export interface CreateLoanDependencies {
  loanRepository: ILoanRepository
  contactRepository: IContactRepository
  loanReceiptStorage: ILoanReceiptStorage
}

export async function createLoanUseCase(
  userId: string,
  rawInput: CreateLoanUseCaseInput,
  {
    loanRepository,
    contactRepository,
    loanReceiptStorage,
  }: CreateLoanDependencies
): Promise<Loan> {
  const { disbursementReceipt, ...loanPayload } = rawInput
  const parsed = createLoanSchema.parse(loanPayload)

  // Validate receipt file upfront before mutating repository or storage
  const validatedReceipt = disbursementReceipt
    ? validateLoanReceiptFile({
        sizeBytes: disbursementReceipt.buffer.byteLength,
        contentType: disbursementReceipt.contentType,
        fileName: disbursementReceipt.fileName,
        extension: disbursementReceipt.extension,
      })
    : null

  const contact = await contactRepository.findById(parsed.contactId, userId)
  if (!contact) {
    throw new LoanDomainError(
      'CONTACT_NOT_FOUND',
      `Contact ${parsed.contactId} not found for user ${userId}`,
      'El contacto seleccionado no existe.'
    )
  }

  if (contact.status !== 'ACTIVE') {
    throw new LoanDomainError(
      'CONTACT_ARCHIVED',
      `Contact ${parsed.contactId} is archived`,
      'No puedes crear un préstamo para un contacto archivado.'
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

  const createdLoan = await loanRepository.create({
    userId,
    contactId: parsed.contactId,
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
    parentLoanId: null,
    notes: parsed.notes,
  })

  if (!disbursementReceipt || !validatedReceipt) {
    return createdLoan
  }

  const uploaded = await loanReceiptStorage.uploadReceipt({
    userId,
    loanId: createdLoan.id,
    filePrefix: 'disbursement',
    buffer: disbursementReceipt.buffer,
    contentType: validatedReceipt.contentType,
    extension: validatedReceipt.extension,
  })

  try {
    return await loanRepository.update(createdLoan.id, userId, {
      disbursementReceiptPath: uploaded.receiptPath,
    })
  } catch (error) {
    await loanReceiptStorage
      .deleteReceipt(uploaded.receiptPath)
      .catch(() => undefined)
    throw error
  }
}
