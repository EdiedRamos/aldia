'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'

import type { ContactPhotoUploadInput } from '@/features/contacts/application/create-contact.use-case'
import { ContactDomainError } from '@/features/contacts/domain/contact.entity'
import { ContactPhotoPolicyError } from '@/features/contacts/domain/contact.policy'
import { contactsContainer } from '@/features/contacts/infrastructure/contacts.container'
import { getCurrentUser } from '@/lib/auth'

export type ContactActionResult = { ok: true } | { ok: false; error: string }

const NO_GUARANTOR_SENTINEL = '__none__'

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
  if (error instanceof ContactDomainError) {
    return error.userMessage
  }
  if (error instanceof ContactPhotoPolicyError) {
    return error.userMessage
  }
  if (error instanceof Error && error.message === 'Unauthorized user session') {
    return 'Debes iniciar sesión para realizar esta acción.'
  }
  return fallbackMessage
}

async function extractPhotoFromFormData(
  formData: FormData
): Promise<ContactPhotoUploadInput | null> {
  const fileEntry = formData.get('photo')
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

function parseOptionalStringField(
  formData: FormData,
  key: string
): string | null | undefined {
  if (!formData.has(key)) {
    return undefined
  }
  const value = formData.get(key)
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed === NO_GUARANTOR_SENTINEL) {
    return null
  }
  return trimmed
}

export async function createContactAction(
  formData: FormData
): Promise<ContactActionResult> {
  try {
    const user = await requireAuthenticatedUser()
    const name = String(formData.get('name') ?? '')
    const phone = parseOptionalStringField(formData, 'phone') ?? null
    const guarantorContactId =
      parseOptionalStringField(formData, 'guarantorContactId') ?? null
    const notes = parseOptionalStringField(formData, 'notes') ?? null
    const photo = await extractPhotoFromFormData(formData)

    await contactsContainer.createContact(user.uid, {
      name,
      phone,
      guarantorContactId,
      notes,
      photo,
    })

    revalidatePath('/contactos')
    return { ok: true }
  } catch (error) {
    console.error('[createContactAction] Failed to create contact:', error)
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo crear el contacto.'),
    }
  }
}

export async function updateContactAction(
  contactId: string,
  formData: FormData
): Promise<ContactActionResult> {
  try {
    const user = await requireAuthenticatedUser()
    const nameRaw = formData.get('name')
    const name = typeof nameRaw === 'string' ? nameRaw : undefined
    const phone = parseOptionalStringField(formData, 'phone')
    const guarantorContactId = parseOptionalStringField(
      formData,
      'guarantorContactId'
    )
    const notes = parseOptionalStringField(formData, 'notes')
    const removePhoto = formData.get('removePhoto') === 'true'
    const photo = await extractPhotoFromFormData(formData)

    await contactsContainer.updateContact(contactId, user.uid, {
      name,
      phone,
      guarantorContactId,
      notes,
      removePhoto,
      photo,
    })

    revalidatePath('/contactos')
    return { ok: true }
  } catch (error) {
    console.error('[updateContactAction] Failed to update contact:', error)
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo actualizar el contacto.'),
    }
  }
}

export async function archiveContactAction(
  contactId: string
): Promise<ContactActionResult> {
  try {
    const user = await requireAuthenticatedUser()

    await contactsContainer.archiveContact(contactId, user.uid)

    revalidatePath('/contactos')
    return { ok: true }
  } catch (error) {
    console.error('[archiveContactAction] Failed to archive contact:', error)
    return {
      ok: false,
      error: formatActionError(error, 'No se pudo archivar el contacto.'),
    }
  }
}
