import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getDoc: vi.fn(),
  recordLoginLog: vi.fn(),
}))

vi.mock("@/lib/firebase-admin", () => ({
  getAdminAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
  getAdminDb: () => ({ doc: () => ({ get: mocks.getDoc }) }),
}))

vi.mock("@/lib/login-log", () => ({
  recordLoginLog: mocks.recordLoginLog,
}))

import { POST } from "@/app/api/auth/session/route"
import { SESSION_COOKIE_NAME } from "@/lib/session"

const ORIGINAL_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL
const ORIGINAL_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

describe("POST /api/auth/session", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.FIREBASE_CLIENT_EMAIL = "test@example.com"
    process.env.FIREBASE_PRIVATE_KEY = "test-private-key"
  })

  afterEach(() => {
    if (ORIGINAL_CLIENT_EMAIL === undefined) {
      delete process.env.FIREBASE_CLIENT_EMAIL
    } else {
      process.env.FIREBASE_CLIENT_EMAIL = ORIGINAL_CLIENT_EMAIL
    }

    if (ORIGINAL_PRIVATE_KEY === undefined) {
      delete process.env.FIREBASE_PRIVATE_KEY
    } else {
      process.env.FIREBASE_PRIVATE_KEY = ORIGINAL_PRIVATE_KEY
    }
  })

  it("returns 400 when the token is missing", async () => {
    const response = await POST(request({}))

    expect(response.status).toBe(400)
    expect(mocks.verifyIdToken).not.toHaveBeenCalled()
  })

  it("returns 500 when admin credentials are missing", async () => {
    delete process.env.FIREBASE_CLIENT_EMAIL
    delete process.env.FIREBASE_PRIVATE_KEY

    const response = await POST(request({ idToken: "token" }))

    expect(response.status).toBe(500)
  })

  it("returns 401 when the token is invalid", async () => {
    mocks.verifyIdToken.mockRejectedValue({ code: "auth/id-token-expired" })

    const response = await POST(request({ idToken: "token" }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.code).toBe("auth/id-token-expired")
    expect(mocks.verifyIdToken).toHaveBeenCalledWith("token", true)
  })

  it("returns 400 when the account has no email", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1" })

    const response = await POST(request({ idToken: "token" }))

    expect(response.status).toBe(400)
  })

  it("returns 403 and logs a denied attempt when the email is not allowed", async () => {
    mocks.verifyIdToken.mockResolvedValue({
      uid: "u1",
      email: " NoAuth@Example.com ",
    })
    mocks.getDoc.mockResolvedValue({ exists: false })

    const response = await POST(
      request(
        { idToken: "token" },
        {
          "x-forwarded-for": "203.0.113.5, 10.0.0.1",
          "user-agent": "test-agent",
        }
      )
    )

    expect(response.status).toBe(403)
    expect(mocks.recordLoginLog).toHaveBeenCalledWith({
      uid: "u1",
      email: "noauth@example.com",
      result: "denied",
      ip: "203.0.113.5",
      userAgent: "test-agent",
    })
  })

  it("returns 200, sets the session cookie and logs the access", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1", email: "a@b.com" })
    mocks.getDoc.mockResolvedValue({ exists: true })

    const response = await POST(
      request(
        { idToken: "token" },
        {
          "x-forwarded-for": "203.0.113.5",
          "user-agent": "test-agent",
        }
      )
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBeTruthy()
    expect(mocks.recordLoginLog).toHaveBeenCalledWith({
      uid: "u1",
      email: "a@b.com",
      result: "ok",
      ip: "203.0.113.5",
      userAgent: "test-agent",
    })
  })

  it("does not fail the login when the log write fails", async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: "u1", email: "a@b.com" })
    mocks.getDoc.mockResolvedValue({ exists: true })
    mocks.recordLoginLog.mockRejectedValue(new Error("firestore down"))

    const response = await POST(request({ idToken: "token" }))

    expect(response.status).toBe(200)
  })
})
