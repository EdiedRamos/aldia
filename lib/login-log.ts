import "server-only"
import { FieldValue, Timestamp } from "firebase-admin/firestore"

import { getAdminDb } from "@/lib/firebase-admin"

const LOG_RETENTION_DAYS = 90

export type LoginLogInput = {
  uid: string
  email: string
  result: "ok" | "denied"
  ip?: string
  userAgent?: string
}

export async function recordLoginLog({
  uid,
  email,
  result,
  ip,
  userAgent,
}: LoginLogInput) {
  const expireAt = Timestamp.fromMillis(
    Date.now() + LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  )

  await getAdminDb()
    .collection("loginLogs")
    .add({
      uid,
      email,
      result,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      createdAt: FieldValue.serverTimestamp(),
      expireAt,
    })
}
