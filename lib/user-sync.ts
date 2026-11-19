import { signOut, type User } from 'firebase/auth'
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type FieldValue,
  type Timestamp,
} from 'firebase/firestore'

import { auth, db } from '@/lib/firebase'

/** Documento de la colección `allowedEmails` (docID = email en minúsculas). */
export interface AllowedEmail {
  email: string
  active: boolean
}

/** Documento de la colección `users` (docID = googleUser.uid). */
export interface UserProfile {
  uid: string
  email: string
  displayName: string | null
  photoURL: string | null
  role: 'ADMIN'
  createdAt: Timestamp | FieldValue
  updatedAt: Timestamp | FieldValue
  whatsappConfig: {
    status: 'DISCONNECTED'
    phone: string | null
    connectedAt: Timestamp | null
  }
  preferences: {
    currency: 'COP'
    reminderDaysBefore: number
  }
}

export type SyncUserResult =
  | { success: true }
  | { success: false; reason: 'UNAUTHORIZED_EMAIL' | 'SYNC_FAILED' }

async function denyAccess(): Promise<SyncUserResult> {
  // Cierra la sesión de Firebase; un fallo de red aquí no debe ocultar el rechazo.
  await signOut(auth).catch(() => {})
  return { success: false, reason: 'UNAUTHORIZED_EMAIL' }
}

/**
 * Valida que el correo de Google esté activo en `/allowedEmails` y sincroniza
 * el perfil del usuario en `/users/{uid}` (docID inmutable = uid de Google).
 */
export async function syncUserWithFirestore(
  googleUser: User
): Promise<SyncUserResult> {
  const email = googleUser.email?.trim().toLowerCase()

  if (!email) {
    return denyAccess()
  }

  try {
    // Paso 1: whitelist por docID = email, igual que /api/auth/session.
    const allowed = await getDoc(doc(db, 'allowedEmails', email))
    const allowedData = allowed.data() as AllowedEmail | undefined

    if (!allowed.exists() || allowedData?.active !== true) {
      return denyAccess()
    }

    // Paso 2: perfil del usuario.
    const userRef = doc(db, 'users', googleUser.uid)
    const existing = await getDoc(userRef)

    const googleFields = {
      email,
      displayName: googleUser.displayName ?? null,
      photoURL: googleUser.photoURL ?? null,
      updatedAt: serverTimestamp(),
    }

    if (existing.exists()) {
      // Caso B: solo datos que Google pudo cambiar; preserva el resto.
      await setDoc(userRef, googleFields, { merge: true })
    } else {
      // Caso A: perfil completo con valores por defecto.
      await setDoc(userRef, {
        uid: googleUser.uid,
        ...googleFields,
        role: 'ADMIN',
        createdAt: serverTimestamp(),
        whatsappConfig: {
          status: 'DISCONNECTED',
          phone: null,
          connectedAt: null,
        },
        preferences: {
          currency: 'COP',
          reminderDaysBefore: 3,
        },
      })
    }

    return { success: true }
  } catch (error) {
    console.error(
      '[syncUserWithFirestore] No se pudo sincronizar el usuario:',
      error
    )
    return { success: false, reason: 'SYNC_FAILED' }
  }
}
