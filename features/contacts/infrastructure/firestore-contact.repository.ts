import 'server-only'
import {
  FieldValue,
  Timestamp,
  type DocumentData,
} from 'firebase-admin/firestore'

import type {
  Contact,
  ContactStatus,
} from '@/features/contacts/domain/contact.entity'
import type {
  CreateContactData,
  IContactRepository,
  UpdateContactData,
} from '@/features/contacts/domain/contact.repository'
import { getAdminDb } from '@/lib/firebase-admin'

const CONTACTS_COLLECTION = 'contacts'

function toIsoDateString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'string') {
    return value
  }

  return new Date().toISOString()
}

function mapDocToContact(id: string, data: DocumentData): Contact {
  return {
    id,
    userId: String(data.userId ?? ''),
    name: String(data.name ?? ''),
    phone: typeof data.phone === 'string' && data.phone ? data.phone : null,
    guarantorContactId:
      typeof data.guarantorContactId === 'string' && data.guarantorContactId
        ? data.guarantorContactId
        : null,
    photoPath:
      typeof data.photoPath === 'string' && data.photoPath
        ? data.photoPath
        : null,
    notes: typeof data.notes === 'string' && data.notes ? data.notes : null,
    status: (data.status as ContactStatus) ?? 'ACTIVE',
    createdAt: toIsoDateString(data.createdAt),
    updatedAt: toIsoDateString(data.updatedAt ?? data.createdAt),
  }
}

export class FirestoreContactRepository implements IContactRepository {
  async findByUserId(userId: string): Promise<Contact[]> {
    const snapshot = await getAdminDb()
      .collection(CONTACTS_COLLECTION)
      .where('userId', '==', userId)
      .get()

    return snapshot.docs
      .map((doc) => mapDocToContact(doc.id, doc.data()))
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      )
  }

  async findActiveByUserId(userId: string): Promise<Contact[]> {
    const snapshot = await getAdminDb()
      .collection(CONTACTS_COLLECTION)
      .where('userId', '==', userId)
      .where('status', '==', 'ACTIVE')
      .get()

    return snapshot.docs
      .map((doc) => mapDocToContact(doc.id, doc.data()))
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
      )
  }

  async findById(contactId: string, userId: string): Promise<Contact | null> {
    const doc = await getAdminDb()
      .collection(CONTACTS_COLLECTION)
      .doc(contactId)
      .get()

    if (!doc.exists) {
      return null
    }

    const data = doc.data()
    if (!data || data.userId !== userId) {
      return null
    }

    return mapDocToContact(doc.id, data)
  }

  async findActiveByPhone(
    userId: string,
    normalizedPhone: string
  ): Promise<Contact | null> {
    const snapshot = await getAdminDb()
      .collection(CONTACTS_COLLECTION)
      .where('userId', '==', userId)
      .where('status', '==', 'ACTIVE')
      .where('phone', '==', normalizedPhone)
      .limit(1)
      .get()

    const doc = snapshot.docs[0]
    if (!doc) {
      return null
    }

    return mapDocToContact(doc.id, doc.data())
  }

  async findActiveByGuarantorId(
    userId: string,
    guarantorContactId: string
  ): Promise<Contact[]> {
    const snapshot = await getAdminDb()
      .collection(CONTACTS_COLLECTION)
      .where('userId', '==', userId)
      .where('status', '==', 'ACTIVE')
      .where('guarantorContactId', '==', guarantorContactId)
      .get()

    return snapshot.docs.map((doc) => mapDocToContact(doc.id, doc.data()))
  }

  async create(contactData: CreateContactData): Promise<Contact> {
    const docRef = getAdminDb().collection(CONTACTS_COLLECTION).doc()
    const nowIso = new Date().toISOString()

    const payload: Record<string, unknown> = {
      userId: contactData.userId,
      name: contactData.name,
      phone: contactData.phone,
      guarantorContactId: contactData.guarantorContactId,
      photoPath: contactData.photoPath,
      notes: contactData.notes,
      status: contactData.status,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    await docRef.set(payload)

    return {
      id: docRef.id,
      userId: contactData.userId,
      name: contactData.name,
      phone: contactData.phone,
      guarantorContactId: contactData.guarantorContactId,
      photoPath: contactData.photoPath,
      notes: contactData.notes,
      status: contactData.status,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
  }

  async update(
    contactId: string,
    userId: string,
    data: UpdateContactData
  ): Promise<Contact> {
    const existing = await this.findById(contactId, userId)
    if (!existing) {
      throw new Error('Contact not found or access denied')
    }

    const nowIso = new Date().toISOString()
    const updatePayload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (data.name !== undefined) {
      updatePayload.name = data.name
    }
    if (data.phone !== undefined) {
      updatePayload.phone = data.phone
    }
    if (data.guarantorContactId !== undefined) {
      updatePayload.guarantorContactId = data.guarantorContactId
    }
    if (data.photoPath !== undefined) {
      updatePayload.photoPath = data.photoPath
    }
    if (data.notes !== undefined) {
      updatePayload.notes = data.notes
    }
    if (data.status !== undefined) {
      updatePayload.status = data.status
    }

    await getAdminDb()
      .collection(CONTACTS_COLLECTION)
      .doc(contactId)
      .update(updatePayload)

    return {
      ...existing,
      name: data.name !== undefined ? data.name : existing.name,
      phone: data.phone !== undefined ? data.phone : existing.phone,
      guarantorContactId:
        data.guarantorContactId !== undefined
          ? data.guarantorContactId
          : existing.guarantorContactId,
      photoPath:
        data.photoPath !== undefined ? data.photoPath : existing.photoPath,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      status: data.status !== undefined ? data.status : existing.status,
      updatedAt: nowIso,
    }
  }
}

export const firestoreContactRepository = new FirestoreContactRepository()
