import type { Contact } from '@/features/contacts/domain/contact.entity'
import {
  CONTACT_PHOTO_SIGNED_URL_TTL_SECONDS,
  isOwnedContactPhotoPath,
} from '@/features/contacts/domain/contact.policy'
import type {
  IContactPhotoStorage,
  IContactRepository,
} from '@/features/contacts/domain/contact.repository'

export interface ResolvedGuarantor {
  id: string
  name: string
  phone: string | null
}

export interface EnrichedContact extends Contact {
  guarantor: ResolvedGuarantor | null
  effectivePhone: string | null
  photoUrl: string | null
  referredCount: number
}

export interface GetContactsDependencies {
  contactRepository: IContactRepository
  contactPhotoStorage: IContactPhotoStorage
  signedUrlTtlSeconds?: number
}

export async function getContactsUseCase(
  userId: string,
  {
    contactRepository,
    contactPhotoStorage,
    signedUrlTtlSeconds = CONTACT_PHOTO_SIGNED_URL_TTL_SECONDS,
  }: GetContactsDependencies
): Promise<EnrichedContact[]> {
  const activeContacts = await contactRepository.findActiveByUserId(userId)

  const contactsById = new Map<string, Contact>()
  const referredCounts = new Map<string, number>()

  for (const contact of activeContacts) {
    contactsById.set(contact.id, contact)
    if (contact.guarantorContactId) {
      referredCounts.set(
        contact.guarantorContactId,
        (referredCounts.get(contact.guarantorContactId) ?? 0) + 1
      )
    }
  }

  const enriched = await Promise.all(
    activeContacts.map(async (contact): Promise<EnrichedContact> => {
      const guarantorRecord = contact.guarantorContactId
        ? (contactsById.get(contact.guarantorContactId) ?? null)
        : null

      const guarantor: ResolvedGuarantor | null = guarantorRecord
        ? {
            id: guarantorRecord.id,
            name: guarantorRecord.name,
            phone: guarantorRecord.phone,
          }
        : null

      const effectivePhone = contact.phone ?? guarantor?.phone ?? null

      let photoUrl: string | null = null
      if (
        contact.photoPath &&
        isOwnedContactPhotoPath(userId, contact.photoPath)
      ) {
        try {
          photoUrl = await contactPhotoStorage.getPhotoReadUrl(
            contact.photoPath,
            signedUrlTtlSeconds
          )
        } catch {
          photoUrl = null
        }
      }

      return {
        ...contact,
        guarantor,
        effectivePhone,
        photoUrl,
        referredCount: referredCounts.get(contact.id) ?? 0,
      }
    })
  )

  return enriched.sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  )
}
