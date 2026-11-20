import {
  assertContactChannelInvariant,
  ContactDomainError,
  type Contact,
} from '@/features/contacts/domain/contact.entity'
import { validateContactPhotoFile } from '@/features/contacts/domain/contact.policy'
import type {
  IContactPhotoStorage,
  IContactRepository,
} from '@/features/contacts/domain/contact.repository'
import {
  createContactSchema,
  type CreateContactInput,
} from '@/features/contacts/domain/contact.schemas'

export interface ContactPhotoUploadInput {
  buffer: Buffer
  contentType: string
  fileName?: string
  extension?: string
}

export interface CreateContactUseCaseInput extends CreateContactInput {
  photo?: ContactPhotoUploadInput | null
}

export interface CreateContactDependencies {
  contactRepository: IContactRepository
  contactPhotoStorage: IContactPhotoStorage
}

export async function createContactUseCase(
  userId: string,
  input: CreateContactUseCaseInput,
  { contactRepository, contactPhotoStorage }: CreateContactDependencies
): Promise<Contact> {
  const parsed = createContactSchema.parse({
    name: input.name,
    phone: input.phone,
    guarantorContactId: input.guarantorContactId,
    notes: input.notes,
  })

  assertContactChannelInvariant(parsed.phone, parsed.guarantorContactId)

  const validatedPhoto = input.photo
    ? validateContactPhotoFile({
        sizeBytes: input.photo.buffer.byteLength,
        contentType: input.photo.contentType,
        fileName: input.photo.fileName,
        extension: input.photo.extension,
      })
    : null

  if (parsed.phone) {
    const existingWithPhone = await contactRepository.findActiveByPhone(
      userId,
      parsed.phone
    )
    if (existingWithPhone) {
      throw new ContactDomainError(
        'DUPLICATE_PHONE',
        `Active contact with phone ${parsed.phone} already exists for user ${userId}`,
        `Ya existe un contacto activo (${existingWithPhone.name}) con este número de teléfono.`
      )
    }
  }

  if (parsed.guarantorContactId) {
    const guarantor = await contactRepository.findById(
      parsed.guarantorContactId,
      userId
    )
    if (!guarantor || guarantor.status !== 'ACTIVE') {
      throw new ContactDomainError(
        'GUARANTOR_NOT_FOUND',
        `Guarantor contact ${parsed.guarantorContactId} not found or inactive`,
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

  const created = await contactRepository.create({
    userId,
    name: parsed.name,
    phone: parsed.phone,
    guarantorContactId: parsed.guarantorContactId,
    photoPath: null,
    notes: parsed.notes,
    status: 'ACTIVE',
  })

  if (!validatedPhoto || !input.photo) {
    return created
  }

  const { photoPath } = await contactPhotoStorage.uploadPhoto({
    userId,
    contactId: created.id,
    buffer: input.photo.buffer,
    contentType: validatedPhoto.contentType,
    extension: validatedPhoto.extension,
  })

  return contactRepository.update(created.id, userId, { photoPath })
}
