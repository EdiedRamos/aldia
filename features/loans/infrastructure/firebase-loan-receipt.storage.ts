import 'server-only'

import {
  buildLoanReceiptPath,
  LOAN_RECEIPT_SIGNED_URL_TTL_SECONDS,
} from '@/features/loans/domain/loan.policy'
import type {
  ILoanReceiptStorage,
  UploadedLoanReceiptResult,
  UploadLoanReceiptParams,
} from '@/features/loans/domain/loan.repository'
import { getAdminStorage } from '@/lib/firebase-admin'

export class FirebaseLoanReceiptStorage implements ILoanReceiptStorage {
  private getBucket() {
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET ??
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

    return getAdminStorage().bucket(bucketName || undefined)
  }

  async uploadReceipt({
    userId,
    loanId,
    filePrefix,
    buffer,
    contentType,
    extension,
  }: UploadLoanReceiptParams): Promise<UploadedLoanReceiptResult> {
    const receiptPath = buildLoanReceiptPath(
      userId,
      loanId,
      filePrefix,
      extension
    )
    const bucket = this.getBucket()
    const file = bucket.file(receiptPath)

    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType,
      },
    })

    return {
      receiptPath,
    }
  }

  async getReceiptReadUrl(
    receiptPath: string,
    expiresInSeconds = LOAN_RECEIPT_SIGNED_URL_TTL_SECONDS
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

export const firebaseLoanReceiptStorage = new FirebaseLoanReceiptStorage()
