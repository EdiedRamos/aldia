'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'

import { ReceiptPolicyError } from '@/features/services/domain/receipt.policy'
import { ServiceDomainError } from '@/features/services/domain/service.entity'
import type {
  CreateServiceInput,
  UpdateServiceInput,
  VoidServicePaymentInput,
} from '@/features/services/domain/service.schemas'
import { servicesContainer } from '@/features/services/infrastructure/services.container'
import { getCurrentUser } from '@/lib/auth'

export type ActionResult = { ok: true } | { ok: false; error: string }
export type ReceiptPreviewActionResult =
  { ok: true; url: string } | { ok: false; error: string }

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
  if (error instanceof ReceiptPolicyError) {
    return error.userMessage
  }
  if (error instanceof ServiceDomainError) {
    return error.userMessage
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

export async function createServiceAction(
  formData: FormData | CreateServiceInput
): Promise<ActionResult> {
  try {
    const user = await requireAuthenticatedUser()
    const payload = parseServicePayload(formData) as CreateServiceInput

    await servicesContainer.createService(user.uid, payload)

    revalidatePath('/servicios')
    revalidatePath('/')
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

    await servicesContainer.updateService(serviceId, user.uid, payload)

    revalidatePath('/servicios')
    revalidatePath('/')
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

    await servicesContainer.archiveService(serviceId, user.uid)

    revalidatePath('/servicios')
    revalidatePath('/')
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

    if (!(fileEntry instanceof File)) {
      return {
        ok: false,
        error: 'Debes adjuntar una imagen o PDF del comprobante.',
      }
    }

    const arrayBuffer = await fileEntry.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    await servicesContainer.registerPayment({
      userId: user.uid,
      serviceId,
      startPeriod,
      monthsCovered,
      buffer,
      contentType: fileEntry.type,
      fileName: fileEntry.name,
    })

    revalidatePath('/servicios')
    revalidatePath('/')
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

    const url = await servicesContainer.getReceiptPreview({
      userId: user.uid,
      receiptPath,
    })

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

export async function voidServicePaymentAction(
  input: VoidServicePaymentInput
): Promise<ActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    await servicesContainer.voidServicePayment({
      userId: user.uid,
      serviceId: input.serviceId,
      paymentId: input.paymentId,
      reason: input.reason,
    })

    revalidatePath('/servicios')
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    console.error(
      '[voidServicePaymentAction] Failed to void service payment:',
      error
    )
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo anular el pago.'),
    }
  }
}
