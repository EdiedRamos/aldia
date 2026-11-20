import 'server-only'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

import {
  DEFAULT_LOGIN_AUDIT_RETENTION_DAYS,
  type LoginAuditEntry,
} from '@/features/auth/domain/auth.entity'
import type { ILoginAuditRepository } from '@/features/auth/domain/auth.repository'
import { getAdminDb } from '@/lib/firebase-admin'

const LOGIN_LOGS_COLLECTION = 'loginLogs'
const DAY_IN_MS = 24 * 60 * 60 * 1000

export class FirestoreLoginAuditRepository implements ILoginAuditRepository {
  async record(entry: LoginAuditEntry): Promise<void> {
    const retentionDays =
      entry.retentionDays ?? DEFAULT_LOGIN_AUDIT_RETENTION_DAYS
    const expireAt = Timestamp.fromMillis(
      Date.now() + retentionDays * DAY_IN_MS
    )

    await getAdminDb()
      .collection(LOGIN_LOGS_COLLECTION)
      .add({
        uid: entry.uid,
        email: entry.email,
        result: entry.result,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        createdAt: FieldValue.serverTimestamp(),
        expireAt,
      })
  }
}

export const firestoreLoginAuditRepository = new FirestoreLoginAuditRepository()
