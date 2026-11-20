import 'server-only'
import { FieldValue } from 'firebase-admin/firestore'

import {
  DEFAULT_USER_PROFILE_POLICY,
  type AllowedEmail,
} from '@/features/auth/domain/auth.entity'
import type {
  IAuthRepository,
  UpsertUserProfileInput,
} from '@/features/auth/domain/auth.repository'
import { getAdminDb } from '@/lib/firebase-admin'

const ALLOWED_EMAILS_COLLECTION = 'allowedEmails'
const USERS_COLLECTION = 'users'

export class FirestoreAuthRepository implements IAuthRepository {
  async findAllowedEmail(email: string): Promise<AllowedEmail | null> {
    const snapshot = await getAdminDb()
      .doc(`${ALLOWED_EMAILS_COLLECTION}/${email}`)
      .get()

    if (!snapshot.exists) {
      return null
    }

    const data = snapshot.data()

    return {
      email: typeof data?.email === 'string' ? data.email : email,
      active: data?.active === true,
    }
  }

  async upsertUserProfile(input: UpsertUserProfileInput): Promise<void> {
    const userRef = getAdminDb().collection(USERS_COLLECTION).doc(input.uid)
    const existing = await userRef.get()

    const identityFields = {
      email: input.email,
      displayName: input.displayName,
      photoURL: input.photoURL,
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (existing.exists) {
      await userRef.set(identityFields, { merge: true })
      return
    }

    await userRef.set({
      uid: input.uid,
      ...identityFields,
      role: DEFAULT_USER_PROFILE_POLICY.role,
      createdAt: FieldValue.serverTimestamp(),
      whatsappConfig: { ...DEFAULT_USER_PROFILE_POLICY.whatsappConfig },
      preferences: { ...DEFAULT_USER_PROFILE_POLICY.preferences },
    })
  }
}

export const firestoreAuthRepository = new FirestoreAuthRepository()
