'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'

import { archiveServiceUseCase } from '@/features/services/application/archive-service.use-case'
import { createServiceUseCase } from '@/features/services/application/create-service.use-case'
import { getReceiptPreviewUseCase } from '@/features/services/application/get-receipt-preview.use-case'
import { registerPaymentUseCase } from '@/features/services/application/register-payment.use-case'
import { updateServiceUseCase } from '@/features/services/application/update-service.use-case'
import type {
  CreateServiceInput,
  UpdateServiceInput,
} from '@/features/services/domain/service.schemas'
import { firebaseReceiptStorage } from '@/features/services/infrastructure/firebase-receipt.storage'
import { firestoreServiceRepository } from '@/features/services/infrastructure/firestore-service.repository'
import { getCurrentUser } from '@/lib/auth'

export type ActionResult = { ok: true } | { ok: false; error: string }
export type ReceiptPreviewActionResult =
  { ok: true; url: string } | { ok: false; error: string }

const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024

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
  if (error instanceof Error && error.message === 'Unauthorized user session') {
    return 'Debes iniciar sesión para realizar esta acción.'
  }
  return fallbackMessage
}

function parseServicePayload(
  formData: FormData | CreateServiceInput | UpdateServiceInput
): Record<string, unknown> {
  if (!(formData instanceof FormData)) {
    return formData as Record<string, unknown>
  }

  const name = formData.get('name')
  const billingDayRaw = formData.get('billingDay')
  const startPeriod = formData.get('startPeriod')
  const paymentUrl = formData.get('paymentUrl')
  const referenceCode = formData.get('referenceCode')
  const status = formData.get('status')

  const payload: Record<string, unknown> = {}

  if (typeof name === 'string') {
    payload.name = name
  }
  if (typeof billingDayRaw === 'string' && billingDayRaw.trim() !== '') {
    payload.billingDay = Number(billingDayRaw)
  }
  if (typeof startPeriod === 'string') {
    payload.startPeriod = startPeriod
  }
  if (typeof paymentUrl === 'string') {
    payload.paymentUrl = paymentUrl
  }
  if (typeof referenceCode === 'string') {
    payload.referenceCode = referenceCode
  }
  if (
    typeof status === 'string' &&
    (status === 'ACTIVE' || status === 'ARCHIVED')
  ) {
    payload.status = status
  }

  return payload
}

function resolveExtension(fileName: string, contentType: string): string {
  if (contentType === 'application/pdf') {
    return 'pdf'
  }
  if (contentType === 'image/jpeg') {
    return 'jpg'
  }
  if (contentType === 'image/png') {
    return 'png'
  }
  if (contentType === 'image/webp') {
    return 'webp'
  }

  const parts = fileName.split('.')
  if (parts.length > 1) {
    return parts[parts.length - 1].toLowerCase()
  }

  return 'jpg'
}

export async function createServiceAction(
  formData: FormData | CreateServiceInput
): Promise<ActionResult> {
  try {
    const user = await requireAuthenticatedUser()
    const payload = parseServicePayload(formData) as CreateServiceInput

    await createServiceUseCase(user.uid, payload, {
      serviceRepository: firestoreServiceRepository,
    })

    revalidatePath('/servicios')
    return { ok: true }
  } catch (error) {
    console.error('[createServiceAction] Failed to create service:', error)
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo crear el servicio.'),
    }
  }
}

export async function updateServiceAction(
  serviceId: string,
  formData: FormData | UpdateServiceInput
): Promise<ActionResult> {
  try {
    const user = await requireAuthenticatedUser()
    const payload = parseServicePayload(formData) as UpdateServiceInput

    await updateServiceUseCase(serviceId, user.uid, payload, {
      serviceRepository: firestoreServiceRepository,
    })

    revalidatePath('/servicios')
    return { ok: true }
  } catch (error) {
    console.error('[updateServiceAction] Failed to update service:', error)
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo actualizar el servicio.'),
    }
  }
}

export async function archiveServiceAction(
  serviceId: string
): Promise<ActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    await archiveServiceUseCase(serviceId, user.uid, {
      serviceRepository: firestoreServiceRepository,
    })

    revalidatePath('/servicios')
    return { ok: true }
  } catch (error) {
    console.error('[archiveServiceAction] Failed to archive service:', error)
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo archivar el servicio.'),
    }
  }
}

export async function registerPaymentAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    const serviceId = String(formData.get('serviceId') ?? '').trim()
    const startPeriod = String(formData.get('startPeriod') ?? '').trim()
    const monthsCoveredRaw = String(formData.get('monthsCovered') ?? '1').trim()
    const monthsCovered = Number(monthsCoveredRaw)
    const fileEntry = formData.get('file')

    if (!(fileEntry instanceof File) || fileEntry.size === 0) {
      return {
        ok: false,
        error: 'Debes adjuntar una imagen o PDF del comprobante.',
      }
    }

    if (fileEntry.size > MAX_RECEIPT_SIZE_BYTES) {
      return {
        ok: false,
        error: 'El archivo no puede superar los 5 MB.',
      }
    }

    const contentType = fileEntry.type
    const isAllowedMime =
      contentType.startsWith('image/') || contentType === 'application/pdf'

    if (!isAllowedMime) {
      return {
        ok: false,
        error: 'Solo se permiten imágenes o archivos PDF.',
      }
    }

    const arrayBuffer = await fileEntry.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const extension = resolveExtension(fileEntry.name, contentType)

    await registerPaymentUseCase(
      {
        userId: user.uid,
        serviceId,
        startPeriod,
        monthsCovered,
        buffer,
        contentType,
        extension,
      },
      {
        serviceRepository: firestoreServiceRepository,
        receiptStorage: firebaseReceiptStorage,
      }
    )

    revalidatePath('/servicios')
    return { ok: true }
  } catch (error) {
    console.error('[registerPaymentAction] Failed to register payment:', error)
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo registrar el pago.'),
    }
  }
}

export async function getReceiptPreviewAction(
  receiptPath: string
): Promise<ReceiptPreviewActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    const url = await getReceiptPreviewUseCase(
      {
        userId: user.uid,
        receiptPath,
      },
      {
        receiptStorage: firebaseReceiptStorage,
      }
    )

    return { ok: true, url }
  } catch (error) {
    console.error(
      '[getReceiptPreviewAction] Failed to generate receipt preview URL:',
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
