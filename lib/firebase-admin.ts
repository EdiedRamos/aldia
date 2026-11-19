import 'server-only'
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

let adminApp: App | undefined

function getAdminApp() {
  if (!adminApp) {
    const existing = getApps()[0]

    if (existing) {
      adminApp = existing
    } else {
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

      if (!clientEmail || !privateKey) {
        throw new Error(
          'FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY deben estar configurados'
        )
      }

      adminApp = initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail,
          privateKey,
        }),
        storageBucket:
          process.env.FIREBASE_STORAGE_BUCKET ??
          process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
    }
  }

  return adminApp
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

export function getAdminDb() {
  return getFirestore(getAdminApp())
}

export function getAdminStorage() {
  return getStorage(getAdminApp())
}
