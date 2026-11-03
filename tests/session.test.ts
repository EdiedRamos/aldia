import { SignJWT } from "jose"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { decryptSession, encryptSession } from "@/lib/session"

const ORIGINAL_SECRET = process.env.SESSION_SECRET

async function signWith(
  secret: string,
  expiresIn: string,
  payload: Record<string, unknown> = { uid: "u1", email: "a@b.com" }
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret))
}

describe("session", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret"
  })

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.SESSION_SECRET
    } else {
      process.env.SESSION_SECRET = ORIGINAL_SECRET
    }
  })

  it("encrypts and decrypts a session", async () => {
    const token = await encryptSession({ uid: "u1", email: "a@b.com", name: "Test User" })
    const payload = await decryptSession(token)

    expect(payload?.uid).toBe("u1")
    expect(payload?.email).toBe("a@b.com")
    expect(payload?.name).toBe("Test User")
    expect(payload?.exp).toBeTypeOf("number")
  })

  it("returns null when there is no token", async () => {
    expect(await decryptSession(undefined)).toBeNull()
  })

  it("returns null for a tampered token", async () => {
    const token = await encryptSession({ uid: "u1", email: "a@b.com", name: "Test User" })

    expect(await decryptSession(`${token}x`)).toBeNull()
  })

  it("returns null when signed with another secret", async () => {
    const token = await signWith("otro-secreto", "1h")

    expect(await decryptSession(token)).toBeNull()
  })

  it("returns null for an expired token", async () => {
    const token = await signWith("test-session-secret", "-1s")

    expect(await decryptSession(token)).toBeNull()
  })

  it("throws when SESSION_SECRET is missing", async () => {
    delete process.env.SESSION_SECRET

    await expect(
      encryptSession({ uid: "u1", email: "a@b.com", name: "Test User" })
    ).rejects.toThrow("SESSION_SECRET")
  })
})
