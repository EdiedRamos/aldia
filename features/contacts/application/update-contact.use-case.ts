import type { ContactPhotoUploadInput } from '@/features/contacts/application/create-contact.use-case'
import {
  assertContactChannelInvariant,
  ContactDomainError,
  type Contact,
} from '@/features/contacts/domain/contact.entity'
import {
  isOwnedContactPhotoPath,
  validateContactPhotoFile,
} from '@/features/contacts/domain/contact.policy'
import type {
  IContactPhotoStorage,
  IContactRepository,
} from '@/features/contacts/domain/contact.repository'
import {
  updateContactSchema,
  type UpdateContactInput,
} from '@/features/contacts/domain/contact.schemas'

export interface UpdateContactUseCaseInput extends UpdateContactInput {
  photo?: ContactPhotoUploadInput | null
}

export interface UpdateContactDependencies {
  contactRepository: IContactRepository
  contactPhotoStorage: IContactPhotoStorage
}

export async function updateContactUseCase(
  contactId: string,
  userId: string,
  input: UpdateContactUseCaseInput,
  { contactRepository, contactPhotoStorage }: UpdateContactDependencies
): Promise<Contact> {
  const parsed = updateContactSchema.parse({
    name: input.name,
    phone: input.phone,
    guarantorContactId: input.guarantorContactId,
    notes: input.notes,
    removePhoto: input.removePhoto,
  })

  const validatedPhoto = input.photo
    ? validateContactPhotoFile({
        sizeBytes: input.photo.buffer.byteLength,
        contentType: input.photo.contentType,
        fileName: input.photo.fileName,
        extension: input.photo.extension,
      })
    : null

  const existing = await contactRepository.findById(contactId, userId)
  if (!existing) {
    throw new ContactDomainError(
      'CONTACT_NOT_FOUND',
      `Contact ${contactId} not found or access denied`,
      'El contacto no existe o no tienes permisos para editarlo.'
    )
  }

  const nextName = parsed.name !== undefined ? parsed.name : existing.name
  const nextPhone = parsed.phone !== undefined ? parsed.phone : existing.phone
  const nextGuarantorContactId =
    parsed.guarantorContactId !== undefined
      ? parsed.guarantorContactId
      : existing.guarantorContactId
  const nextNotes = parsed.notes !== undefined ? parsed.notes : existing.notes

  assertContactChannelInvariant(nextPhone, nextGuarantorContactId, contactId)

  if (existing.phone && !nextPhone) {
    const activeDependents = await contactRepository.findActiveByGuarantorId(
      userId,
      contactId
    )
    if (activeDependents.length > 0) {
      throw new ContactDomainError(
        'CANNOT_REMOVE_PHONE_WHILE_GUARANTOR',
        `Cannot remove phone from contact ${contactId} while it is an active guarantor`,
        'No puedes quitar el teléfono de este contacto mientras sea intermediario activo de otros contactos.'
      )
    }
  }

  if (nextPhone && nextPhone !== existing.phone) {
    const duplicate = await contactRepository.findActiveByPhone(
      userId,
      nextPhone
    )
    if (duplicate && duplicate.id !== contactId) {
      throw new ContactDomainError(
        'DUPLICATE_PHONE',
        `Active contact with phone ${nextPhone} already exists for user ${userId}`,
        `Ya existe otro contacto activo (${duplicate.name}) con este número de teléfono.`
      )
    }
  }

  if (
    nextGuarantorContactId &&
    nextGuarantorContactId !== existing.guarantorContactId
  ) {
    const guarantor = await contactRepository.findById(
      nextGuarantorContactId,
      userId
    )
    if (!guarantor || guarantor.status !== 'ACTIVE') {
      throw new ContactDomainError(
        'GUARANTOR_NOT_FOUND',
        `Guarantor contact ${nextGuarantorContactId} not found or inactive`,
        'El intermediario seleccionado no existe o está archivado.'
      )
    }

    if (!guarantor.phone) {
      throw new ContactDomainError(
        'GUARANTOR_WITHOUT_PHONE',
        `Guarantor contact ${guarantor.id} does not have a direct phone number`,
        'El intermediario seleccionado debe tener un teléfono propio registrado.'
      )
    }
  }

  let nextPhotoPath = existing.photoPath
  let stalePhotoPathToDelete: string | null = null

  if (validatedPhoto && input.photo) {
    const { photoPath } = await contactPhotoStorage.uploadPhoto({
      userId,
      contactId,
      buffer: input.photo.buffer,
      contentType: validatedPhoto.contentType,
      extension: validatedPhoto.extension,
    })

    if (existing.photoPath && existing.photoPath !== photoPath) {
      stalePhotoPathToDelete = existing.photoPath
    }
    nextPhotoPath = photoPath
  } else if (parsed.removePhoto && existing.photoPath) {
    stalePhotoPathToDelete = existing.photoPath
    nextPhotoPath = null
  }

  const updated = await contactRepository.update(contactId, userId, {
    name: nextName,
    phone: nextPhone,
    guarantorContactId: nextGuarantorContactId,
    notes: nextNotes,
    photoPath: nextPhotoPath,
  })

  if (
    stalePhotoPathToDelete &&
    isOwnedContactPhotoPath(userId, stalePhotoPathToDelete)
  ) {
    await contactPhotoStorage.deletePhoto(stalePhotoPathToDelete)
  }

  return updated
}
