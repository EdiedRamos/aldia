import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server"
import { describe, expect, it } from "vitest"

import { config } from "@/proxy"

describe("proxy matcher", () => {
  it.each([
    "/",
    "/login",
    "/privacy",
    "/terms",
    "/dashboard",
    "/dashboard/loans",
  ])("runs on %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
  })

  it.each([
    "/api/auth/session",
    "/api/auth/logout",
    "/_next/static/chunk.js",
    "/_next/image",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
  ])("does not run on %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
  })
})
