import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteCookie: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: mocks.deleteCookie }),
}))

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}))

import { logout } from "@/lib/actions/auth"
import { SESSION_COOKIE_NAME } from "@/lib/session"

describe("logout action", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("deletes the session cookie and redirects to /login", async () => {
    await logout()

    expect(mocks.deleteCookie).toHaveBeenCalledWith(SESSION_COOKIE_NAME)
    expect(mocks.redirect).toHaveBeenCalledWith("/login")
  })
})
