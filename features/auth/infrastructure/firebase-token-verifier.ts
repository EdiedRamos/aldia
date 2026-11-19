import 'server-only'

import type { VerifiedIdentity } from '@/features/auth/domain/auth.entity'
import type { ITokenVerifier } from '@/features/auth/domain/auth.repository'
import { getAdminAuth } from '@/lib/firebase-admin'

export class FirebaseTokenVerifier implements ITokenVerifier {
  async verifyIdToken(idToken: string): Promise<VerifiedIdentity> {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true)

    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
    }
  }
}

export const firebaseTokenVerifier = new FirebaseTokenVerifier()
