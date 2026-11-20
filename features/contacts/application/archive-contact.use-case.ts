import {
  ContactDomainError,
  type Contact,
} from '@/features/contacts/domain/contact.entity'
import type { IContactRepository } from '@/features/contacts/domain/contact.repository'

export interface ArchiveContactDependencies {
  contactRepository: IContactRepository
}

export async function archiveContactUseCase(
  contactId: string,
  userId: string,
  { contactRepository }: ArchiveContactDependencies
): Promise<Contact> {
  const existing = await contactRepository.findById(contactId, userId)
  if (!existing) {
    throw new ContactDomainError(
      'CONTACT_NOT_FOUND',
      `Contact ${contactId} not found or access denied`,
      'El contacto no existe o no tienes permisos para archivarlo.'
    )
  }

  const activeDependents = await contactRepository.findActiveByGuarantorId(
    userId,
    contactId
  )
  if (activeDependents.length > 0) {
    const dependentNames = activeDependents
      .slice(0, 3)
      .map((item) => item.name)
      .join(', ')
    const suffix =
      activeDependents.length > 3 ? ` y ${activeDependents.length - 3} más` : ''

    throw new ContactDomainError(
      'CONTACT_IS_ACTIVE_GUARANTOR',
      `Contact ${contactId} is an active guarantor for ${activeDependents.length} contact(s)`,
      `No puedes archivar a "${existing.name}" porque es intermediario activo de ${dependentNames}${suffix}. Desvincula primero a esos contactos.`
    )
  }

  return contactRepository.update(contactId, userId, { status: 'ARCHIVED' })
}
