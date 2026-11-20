import 'server-only'

import { archiveContactUseCase } from '@/features/contacts/application/archive-contact.use-case'
import {
  createContactUseCase,
  type CreateContactUseCaseInput,
} from '@/features/contacts/application/create-contact.use-case'
import {
  getContactsUseCase,
  type EnrichedContact,
} from '@/features/contacts/application/get-contacts.use-case'
import {
  updateContactUseCase,
  type UpdateContactUseCaseInput,
} from '@/features/contacts/application/update-contact.use-case'
import type { Contact } from '@/features/contacts/domain/contact.entity'
import { firebaseContactPhotoStorage } from '@/features/contacts/infrastructure/firebase-contact-photo.storage'
import { firestoreContactRepository } from '@/features/contacts/infrastructure/firestore-contact.repository'

/**
 * Composition root for the `contacts` feature.
 * Binds application use cases to concrete Firestore and Firebase Storage adapters.
 */
export const contactsContainer = {
  getContacts(userId: string): Promise<EnrichedContact[]> {
    return getContactsUseCase(userId, {
      contactRepository: firestoreContactRepository,
      contactPhotoStorage: firebaseContactPhotoStorage,
    })
  },

  createContact(
    userId: string,
    input: CreateContactUseCaseInput
  ): Promise<Contact> {
    return createContactUseCase(userId, input, {
      contactRepository: firestoreContactRepository,
      contactPhotoStorage: firebaseContactPhotoStorage,
    })
  },

  updateContact(
    contactId: string,
    userId: string,
    input: UpdateContactUseCaseInput
  ): Promise<Contact> {
    return updateContactUseCase(contactId, userId, input, {
      contactRepository: firestoreContactRepository,
      contactPhotoStorage: firebaseContactPhotoStorage,
    })
  },

  archiveContact(contactId: string, userId: string): Promise<Contact> {
    return archiveContactUseCase(contactId, userId, {
      contactRepository: firestoreContactRepository,
    })
  },
}
