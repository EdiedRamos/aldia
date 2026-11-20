import 'server-only'

import {
  buildContactPhotoPath,
  CONTACT_PHOTO_SIGNED_URL_TTL_SECONDS,
} from '@/features/contacts/domain/contact.policy'
import type {
  IContactPhotoStorage,
  UploadContactPhotoParams,
  UploadedContactPhotoResult,
} from '@/features/contacts/domain/contact.repository'
import { getAdminStorage } from '@/lib/firebase-admin'

export class FirebaseContactPhotoStorage implements IContactPhotoStorage {
  private getBucket() {
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET ??
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

    return getAdminStorage().bucket(bucketName || undefined)
  }

  async uploadPhoto({
    userId,
    contactId,
    buffer,
    contentType,
    extension,
  }: UploadContactPhotoParams): Promise<UploadedContactPhotoResult> {
    const photoPath = buildContactPhotoPath(userId, contactId, extension)
    const bucket = this.getBucket()
    const file = bucket.file(photoPath)

    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType,
      },
    })

    return {
      photoPath,
    }
  }

  async getPhotoReadUrl(
    photoPath: string,
    expiresInSeconds = CONTACT_PHOTO_SIGNED_URL_TTL_SECONDS
  ): Promise<string> {
    const bucket = this.getBucket()
    const file = bucket.file(photoPath)
    const expiresAt = Date.now() + expiresInSeconds * 1000

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiresAt,
    })

    return signedUrl
  }

  async deletePhoto(photoPath: string): Promise<void> {
    if (!photoPath) {
      return
    }

    const bucket = this.getBucket()
    const file = bucket.file(photoPath)
    const [exists] = await file.exists()

    if (exists) {
      await file.delete()
    }
  }
}

export const firebaseContactPhotoStorage = new FirebaseContactPhotoStorage()
