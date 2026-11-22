import 'server-only'

import { firestoreContactRepository } from '@/features/contacts/infrastructure/firestore-contact.repository'
import {
  attachLoanDisbursementReceiptUseCase,
  type AttachLoanDisbursementReceiptInput,
} from '@/features/loans/application/attach-loan-disbursement-receipt.use-case'
import {
  attachLoanPaymentReceiptUseCase,
  type AttachLoanPaymentReceiptInput,
  type AttachLoanPaymentReceiptResult,
} from '@/features/loans/application/attach-loan-payment-receipt.use-case'
import { archiveLoanUseCase } from '@/features/loans/application/archive-loan.use-case'
import {
  createLoanUseCase,
  type CreateLoanUseCaseInput,
} from '@/features/loans/application/create-loan.use-case'
import {
  getLoanReceiptPreviewUseCase,
  type GetLoanReceiptPreviewInput,
} from '@/features/loans/application/get-loan-receipt-preview.use-case'
import {
  getLoansBoardUseCase,
  type LoansBoard,
} from '@/features/loans/application/get-loans-board.use-case'
import { getWhatsAppTemplatesUseCase } from '@/features/loans/application/get-whatsapp-templates.use-case'
import {
  refinanceLoanUseCase,
  type RefinanceLoanResult,
} from '@/features/loans/application/refinance-loan.use-case'
import {
  registerLoanPaymentUseCase,
  type RegisterLoanPaymentResult,
  type RegisterLoanPaymentUseCaseInput,
} from '@/features/loans/application/register-loan-payment.use-case'
import { updateInstallmentUseCase } from '@/features/loans/application/update-installment.use-case'
import { updateWhatsAppTemplatesUseCase } from '@/features/loans/application/update-whatsapp-templates.use-case'
import {
  voidLoanPaymentUseCase,
  type VoidLoanPaymentResult,
  type VoidLoanPaymentUseCaseInput,
} from '@/features/loans/application/void-loan-payment.use-case'
import type { Loan } from '@/features/loans/domain/loan.entity'
import type {
  RefinanceLoanInput,
  UpdateInstallmentInput,
  UpdateWhatsAppTemplatesInput,
} from '@/features/loans/domain/loan.schemas'
import type { WhatsAppMessageTemplates } from '@/features/loans/domain/loan-whatsapp-template'
import { firebaseLoanReceiptStorage } from '@/features/loans/infrastructure/firebase-loan-receipt.storage'
import { firestoreLoanRepository } from '@/features/loans/infrastructure/firestore-loan.repository'
import { firestoreLoanSettingsRepository } from '@/features/loans/infrastructure/firestore-loan-settings.repository'

/**
 * Composition root for the `loans` feature.
 * Binds application use cases to concrete Firestore and Firebase Storage adapters.
 */
export const loansContainer = {
  getLoansBoard(
    userId: string,
    referenceDate?: Date | string
  ): Promise<LoansBoard> {
    return getLoansBoardUseCase(userId, {
      loanRepository: firestoreLoanRepository,
      contactRepository: firestoreContactRepository,
      referenceDate,
    })
  },

  createLoan(userId: string, input: CreateLoanUseCaseInput): Promise<Loan> {
    return createLoanUseCase(userId, input, {
      loanRepository: firestoreLoanRepository,
      contactRepository: firestoreContactRepository,
      loanReceiptStorage: firebaseLoanReceiptStorage,
    })
  },

  registerLoanPayment(
    userId: string,
    input: RegisterLoanPaymentUseCaseInput
  ): Promise<RegisterLoanPaymentResult> {
    return registerLoanPaymentUseCase(userId, input, {
      loanRepository: firestoreLoanRepository,
      loanReceiptStorage: firebaseLoanReceiptStorage,
    })
  },

  updateInstallment(
    userId: string,
    input: UpdateInstallmentInput
  ): Promise<Loan> {
    return updateInstallmentUseCase(userId, input, {
      loanRepository: firestoreLoanRepository,
    })
  },

  refinanceLoan(
    userId: string,
    input: RefinanceLoanInput
  ): Promise<RefinanceLoanResult> {
    return refinanceLoanUseCase(userId, input, {
      loanRepository: firestoreLoanRepository,
    })
  },

  getLoanReceiptPreview(input: GetLoanReceiptPreviewInput): Promise<string> {
    return getLoanReceiptPreviewUseCase(input, {
      loanReceiptStorage: firebaseLoanReceiptStorage,
    })
  },

  archiveLoan(loanId: string, userId: string): Promise<Loan> {
    return archiveLoanUseCase(loanId, userId, {
      loanRepository: firestoreLoanRepository,
    })
  },

  attachLoanDisbursementReceipt(
    userId: string,
    input: AttachLoanDisbursementReceiptInput
  ): Promise<Loan> {
    return attachLoanDisbursementReceiptUseCase(userId, input, {
      loanRepository: firestoreLoanRepository,
      loanReceiptStorage: firebaseLoanReceiptStorage,
    })
  },

  attachLoanPaymentReceipt(
    userId: string,
    input: AttachLoanPaymentReceiptInput
  ): Promise<AttachLoanPaymentReceiptResult> {
    return attachLoanPaymentReceiptUseCase(userId, input, {
      loanRepository: firestoreLoanRepository,
      loanReceiptStorage: firebaseLoanReceiptStorage,
    })
  },

  voidLoanPayment(
    input: VoidLoanPaymentUseCaseInput
  ): Promise<VoidLoanPaymentResult> {
    return voidLoanPaymentUseCase(input, {
      loanRepository: firestoreLoanRepository,
    })
  },

  getWhatsAppTemplates(userId: string): Promise<WhatsAppMessageTemplates> {
    return getWhatsAppTemplatesUseCase(userId, {
      loanSettingsRepository: firestoreLoanSettingsRepository,
    })
  },

  updateWhatsAppTemplates(
    userId: string,
    input: UpdateWhatsAppTemplatesInput
  ): Promise<WhatsAppMessageTemplates> {
    return updateWhatsAppTemplatesUseCase(userId, input, {
      loanSettingsRepository: firestoreLoanSettingsRepository,
    })
  },
}
