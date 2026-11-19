import 'server-only'
import { getDownloadURL } from 'firebase-admin/storage'

import type {
  IReceiptStorage,
  UploadedReceiptResult,
  UploadReceiptParams,
} from '@/features/services/domain/service.repository'
import { getAdminStorage } from '@/lib/firebase-admin'

const DEFAULT_SIGNED_URL_TTL_SECONDS = 900

export class FirebaseReceiptStorage implements IReceiptStorage {
  private getBucket() {
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET ??
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

    return getAdminStorage().bucket(bucketName || undefined)
  }

  async uploadReceipt({
    userId,
    serviceId,
    period,
    buffer,
    contentType,
    extension,
  }: UploadReceiptParams): Promise<UploadedReceiptResult> {
    const cleanExtension = extension.replace(/^\./, '').toLowerCase() || 'bin'
    const receiptPath = `receipts/${userId}/${serviceId}/${period}.${cleanExtension}`
    const bucket = this.getBucket()
    const file = bucket.file(receiptPath)

    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType,
      },
    })

    const receiptUrl = await getDownloadURL(file)

    return {
      receiptUrl,
      receiptPath,
    }
  }

  async getReceiptReadUrl(
    receiptPath: string,
    expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS
  ): Promise<string> {
    const bucket = this.getBucket()
    const file = bucket.file(receiptPath)
    const expiresAt = Date.now() + expiresInSeconds * 1000

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiresAt,
    })

    return signedUrl
  }

  async deleteReceipt(receiptPath: string): Promise<void> {
    if (!receiptPath) {
      return
    }

    const bucket = this.getBucket()
    const file = bucket.file(receiptPath)
    const [exists] = await file.exists()

    if (exists) {
      await file.delete()
    }
  }
}

export const firebaseReceiptStorage = new FirebaseReceiptStorage()
