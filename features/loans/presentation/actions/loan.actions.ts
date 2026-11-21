'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'

import type { LoanReceiptUploadInput } from '@/features/loans/application/create-loan.use-case'
import {
  LoanDomainError,
  type LoanInterestModel,
} from '@/features/loans/domain/loan.entity'
import { LoanReceiptPolicyError } from '@/features/loans/domain/loan.policy'
import type {
  RefinanceLoanInput,
  UpdateInstallmentInput,
  UpdateWhatsAppTemplatesInput,
  VoidLoanPaymentInput,
} from '@/features/loans/domain/loan.schemas'
import type { WhatsAppMessageTemplates } from '@/features/loans/domain/loan-whatsapp-template'
import { loansContainer } from '@/features/loans/infrastructure/loans.container'
import { getCurrentUser } from '@/lib/auth'

export type LoanActionResult = { ok: true } | { ok: false; error: string }

export type LoanReceiptPreviewActionResult =
  { ok: true; url: string } | { ok: false; error: string }

export type AttachLoanReceiptActionResult =
  { ok: true; receiptPath: string } | { ok: false; error: string }

export type WhatsAppTemplatesActionResult =
  | { ok: true; templates: WhatsAppMessageTemplates }
  | { ok: false; error: string }

async function requireAuthenticatedUser() {
  const user = await getCurrentUser()
  if (!user || !user.uid) {
    throw new Error('Unauthorized user session')
  }
  return user
}

function formatActionError(error: unknown, fallbackMessage: string): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? fallbackMessage
  }
  if (error instanceof LoanDomainError) {
    return error.userMessage
  }
  if (error instanceof LoanReceiptPolicyError) {
    return error.userMessage
  }
  if (error instanceof Error && error.message === 'Unauthorized user session') {
    return 'Debes iniciar sesión para realizar esta acción.'
  }
  return fallbackMessage
}

async function extractReceiptFromFormData(
  formData: FormData,
  fieldName: string
): Promise<LoanReceiptUploadInput | null> {
  const fileEntry = formData.get(fieldName)
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return null
  }

  const arrayBuffer = await fileEntry.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: fileEntry.type,
    fileName: fileEntry.name,
  }
}

export async function createLoanAction(
  formData: FormData
): Promise<LoanActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    const contactId = String(formData.get('contactId') ?? '').trim()
    const principalAmount = Number(formData.get('principalAmount') ?? 0)
    const interestRate = Number(formData.get('interestRate') ?? 0)
    const interestModel = String(
      formData.get('interestModel') ?? 'NO_INTEREST'
    ) as LoanInterestModel
    const disbursementDate = String(
      formData.get('disbursementDate') ?? ''
    ).trim()
    const monthlyBillingDayRaw = formData.get('monthlyBillingDay')
    const monthlyBillingDay =
      typeof monthlyBillingDayRaw === 'string' &&
      monthlyBillingDayRaw.trim() !== ''
        ? Number(monthlyBillingDayRaw)
        : undefined
    const installmentCountRaw = formData.get('installmentCount')
    const installmentCount =
      typeof installmentCountRaw === 'string' &&
      installmentCountRaw.trim() !== ''
        ? Number(installmentCountRaw)
        : undefined
    const notesRaw = formData.get('notes')
    const notes = typeof notesRaw === 'string' ? notesRaw : null

    const installmentsJson = formData.get('installmentsJson')
    let installments:
      | Array<{
          installmentNumber?: number
          dueDate: string
          principalDue: number
          interestDue: number
          lateFeeDue?: number
        }>
      | undefined

    if (typeof installmentsJson === 'string' && installmentsJson.trim()) {
      const parsedJson = JSON.parse(installmentsJson)
      if (Array.isArray(parsedJson)) {
        installments = parsedJson
      }
    }

    const disbursementReceipt = await extractReceiptFromFormData(
      formData,
      'receipt'
    )

    await loansContainer.createLoan(user.uid, {
      contactId,
      principalAmount,
      interestRate,
      interestModel,
      disbursementDate,
      monthlyBillingDay,
      installmentCount,
      installments,
      notes,
      disbursementReceipt,
    })

    revalidatePath('/prestamos')
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    console.error('[createLoanAction] Failed to create loan:', error)
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo crear el préstamo.'),
    }
  }
}

export async function registerLoanPaymentAction(
  formData: FormData
): Promise<LoanActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    const loanId = String(formData.get('loanId') ?? '').trim()
    const amount = Number(formData.get('amount') ?? 0)
    const paidAtRaw = formData.get('paidAt')
    const paidAt =
      typeof paidAtRaw === 'string' && paidAtRaw.trim() !== ''
        ? paidAtRaw.trim()
        : undefined
    const notesRaw = formData.get('notes')
    const notes = typeof notesRaw === 'string' ? notesRaw : null
    const receipt = await extractReceiptFromFormData(formData, 'receipt')

    await loansContainer.registerLoanPayment(user.uid, {
      loanId,
      amount,
      paidAt,
      notes,
      receipt,
    })

    revalidatePath('/prestamos')
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    console.error(
      '[registerLoanPaymentAction] Failed to register payment:',
      error
    )
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo registrar el abono.'),
    }
  }
}

export async function updateInstallmentAction(
  input: UpdateInstallmentInput
): Promise<LoanActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    await loansContainer.updateInstallment(user.uid, input)

    revalidatePath('/prestamos')
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    console.error(
      '[updateInstallmentAction] Failed to update installment:',
      error
    )
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo actualizar la cuota.'),
    }
  }
}

export async function refinanceLoanAction(
  input: RefinanceLoanInput
): Promise<LoanActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    await loansContainer.refinanceLoan(user.uid, input)

    revalidatePath('/prestamos')
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    console.error('[refinanceLoanAction] Failed to refinance loan:', error)
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo refinanciar el préstamo.'),
    }
  }
}

export async function archiveLoanAction(
  loanId: string
): Promise<LoanActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    await loansContainer.archiveLoan(loanId, user.uid)

    revalidatePath('/prestamos')
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    console.error('[archiveLoanAction] Failed to archive loan:', error)
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo archivar el préstamo.'),
    }
  }
}

export async function getLoanReceiptPreviewAction(
  receiptPath: string
): Promise<LoanReceiptPreviewActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    const url = await loansContainer.getLoanReceiptPreview({
      userId: user.uid,
      receiptPath,
    })

    return { ok: true, url }
  } catch (error) {
    console.error(
      '[getLoanReceiptPreviewAction] Failed to generate receipt preview URL:',
      error
    )
    return {
      ok: false,
      error: formatActionError(
        error,
        'No se pudo obtener la vista previa del comprobante.'
      ),
    }
  }
}

export async function attachLoanDisbursementReceiptAction(
  formData: FormData
): Promise<AttachLoanReceiptActionResult> {
  try {
    const user = await requireAuthenticatedUser()
    const loanId = String(formData.get('loanId') ?? '').trim()
    const receipt = await extractReceiptFromFormData(formData, 'receipt')

    if (!receipt) {
      return {
        ok: false,
        error: 'Debes seleccionar una imagen o PDF del comprobante.',
      }
    }

    const updatedLoan = await loansContainer.attachLoanDisbursementReceipt(
      user.uid,
      {
        loanId,
        receipt,
      }
    )

    revalidatePath('/prestamos')
    revalidatePath('/')
    return {
      ok: true,
      receiptPath: updatedLoan.disbursementReceiptPath ?? '',
    }
  } catch (error) {
    console.error(
      '[attachLoanDisbursementReceiptAction] Failed to attach disbursement receipt:',
      error
    )
    return {
      ok: false,
      error: formatActionError(
        error,
        'No se pudo adjuntar el comprobante de desembolso.'
      ),
    }
  }
}

export async function attachLoanPaymentReceiptAction(
  formData: FormData
): Promise<AttachLoanReceiptActionResult> {
  try {
    const user = await requireAuthenticatedUser()
    const loanId = String(formData.get('loanId') ?? '').trim()
    const paymentId = String(formData.get('paymentId') ?? '').trim()
    const receipt = await extractReceiptFromFormData(formData, 'receipt')

    if (!receipt) {
      return {
        ok: false,
        error: 'Debes seleccionar una imagen o PDF del comprobante.',
      }
    }

    const result = await loansContainer.attachLoanPaymentReceipt(user.uid, {
      loanId,
      paymentId,
      receipt,
    })

    revalidatePath('/prestamos')
    revalidatePath('/')
    return {
      ok: true,
      receiptPath: result.payment.receiptPath ?? '',
    }
  } catch (error) {
    console.error(
      '[attachLoanPaymentReceiptAction] Failed to attach payment receipt:',
      error
    )
    return {
      ok: false,
      error: formatActionError(
        error,
        'No se pudo adjuntar el comprobante del abono.'
      ),
    }
  }
}

export async function voidLoanPaymentAction(
  input: VoidLoanPaymentInput
): Promise<LoanActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    await loansContainer.voidLoanPayment({
      userId: user.uid,
      loanId: input.loanId,
      paymentId: input.paymentId,
      reason: input.reason,
    })

    revalidatePath('/prestamos')
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    console.error('[voidLoanPaymentAction] Failed to void loan payment:', error)
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo anular el abono.'),
    }
  }
}

export async function getWhatsAppTemplatesAction(): Promise<WhatsAppTemplatesActionResult> {
  try {
    const user = await requireAuthenticatedUser()
    const templates = await loansContainer.getWhatsAppTemplates(user.uid)
    return { ok: true, templates }
  } catch (error) {
    console.error(
      '[getWhatsAppTemplatesAction] Failed to load WhatsApp templates:',
      error
    )
    return {
      ok: false,
      error: formatActionError(
        error,
        'No se pudieron cargar las plantillas de WhatsApp.'
      ),
    }
  }
}

export async function updateWhatsAppTemplatesAction(
  input: UpdateWhatsAppTemplatesInput
): Promise<WhatsAppTemplatesActionResult> {
  try {
    const user = await requireAuthenticatedUser()
    const templates = await loansContainer.updateWhatsAppTemplates(
      user.uid,
      input
    )

    revalidatePath('/prestamos')
    revalidatePath('/')
    return { ok: true, templates }
  } catch (error) {
    console.error(
      '[updateWhatsAppTemplatesAction] Failed to save WhatsApp templates:',
      error
    )
    return {
      ok: false,
      error: formatActionError(
        error,
        'No se pudieron guardar las plantillas de WhatsApp.'
      ),
    }
  }
}
