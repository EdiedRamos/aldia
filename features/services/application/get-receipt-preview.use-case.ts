import type { IReceiptStorage } from '@/features/services/domain/service.repository'

const DEFAULT_EXPIRES_IN_SECONDS = 900

export interface GetReceiptPreviewInput {
  userId: string
  receiptPath: string
  expiresInSeconds?: number
}

export interface GetReceiptPreviewDependencies {
  receiptStorage: IReceiptStorage
}

/**
 * Generates a short-lived signed read URL for a stored service receipt
 * after enforcing that the receipt path strictly belongs to the authenticated user.
 */
export async function getReceiptPreviewUseCase(
  input: GetReceiptPreviewInput,
  { receiptStorage }: GetReceiptPreviewDependencies
): Promise<string> {
  const userId = input.userId.trim()
  const receiptPath = input.receiptPath.trim()

  if (!userId) {
    throw new Error('Unauthorized: userId is required')
  }

  if (!receiptPath) {
    throw new Error('Invalid receiptPath: path cannot be empty')
  }

  const expectedPrefix = `receipts/${userId}/`
  const hasPathTraversal =
    receiptPath.includes('..') || receiptPath.startsWith('/')

  if (hasPathTraversal || !receiptPath.startsWith(expectedPrefix)) {
    throw new Error(
      'Forbidden: receipt does not belong to the authenticated user'
    )
  }

  const expiresInSeconds = input.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS

  return receiptStorage.getReceiptReadUrl(receiptPath, expiresInSeconds)
}
