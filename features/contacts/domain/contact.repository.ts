import type {
  Contact,
  ContactStatus,
} from '@/features/contacts/domain/contact.entity'

export interface CreateContactData {
  userId: string
  name: string
  phone: string | null
  guarantorContactId: string | null
  photoPath: string | null
  notes: string | null
  status: ContactStatus
}

export interface UpdateContactData {
  name?: string
  phone?: string | null
  guarantorContactId?: string | null
  photoPath?: string | null
  notes?: string | null
  status?: ContactStatus
}

export interface IContactRepository {
  findByUserId(userId: string): Promise<Contact[]>
  findActiveByUserId(userId: string): Promise<Contact[]>
  findById(contactId: string, userId: string): Promise<Contact | null>
  findActiveByPhone(
    userId: string,
    normalizedPhone: string
  ): Promise<Contact | null>
  findActiveByGuarantorId(
    userId: string,
    guarantorContactId: string
  ): Promise<Contact[]>
  create(contactData: CreateContactData): Promise<Contact>
  update(
    contactId: string,
    userId: string,
    data: UpdateContactData
  ): Promise<Contact>
}

export interface UploadContactPhotoParams {
  userId: string
  contactId: string
  buffer: Buffer
  contentType: string
  extension: string
}

export interface UploadedContactPhotoResult {
  photoPath: string
}

export interface IContactPhotoStorage {
  uploadPhoto(
    params: UploadContactPhotoParams
  ): Promise<UploadedContactPhotoResult>
  getPhotoReadUrl(photoPath: string, expiresInSeconds?: number): Promise<string>
  deletePhoto(photoPath: string): Promise<void>
}
