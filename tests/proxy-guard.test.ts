import { getRedirectUrl } from "next/experimental/testing/server"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { guard } from "@/lib/proxy/guard"
import { encryptSession, SESSION_COOKIE_NAME } from "@/lib/session"

const ORIGINAL_SECRET = process.env.SESSION_SECRET

function request(path: string, token?: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : undefined,
  })
}

describe("guard", () => {
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

  it("redirects a protected route without session to /login", async () => {
    const response = await guard(request("/"))

    expect(getRedirectUrl(response)).toBe("http://localhost:3000/login")
  })

  it("allows a protected route with session", async () => {
    const token = await encryptSession({ uid: "u1", email: "a@b.com", name: "Test User" })

    const response = await guard(request("/", token))

    expect(getRedirectUrl(response)).toBeNull()
  })

  it("allows /login without session", async () => {
    const response = await guard(request("/login"))

    expect(getRedirectUrl(response)).toBeNull()
  })

  it("redirects /login to / when session exists", async () => {
    const token = await encryptSession({ uid: "u1", email: "a@b.com", name: "Test User" })

    const response = await guard(request("/login", token))

    expect(getRedirectUrl(response)).toBe("http://localhost:3000/")
  })

  it("allows a public route without session", async () => {
    const response = await guard(request("/privacy"))

    expect(getRedirectUrl(response)).toBeNull()
  })

  it("treats unknown routes as protected", async () => {
    const response = await guard(request("/nope"))

    expect(getRedirectUrl(response)).toBe("http://localhost:3000/login")
  })

  it("deletes a stale session cookie", async () => {
    const response = await guard(request("/login", "basura"))

    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("")
  })
})
