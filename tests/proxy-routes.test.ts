import { describe, expect, it } from "vitest"

import { classify } from "@/lib/proxy/routes"

describe("classify", () => {
  it.each([
    ["/login", "guest-only"],
    ["/login/verify", "guest-only"],
    ["/privacy", "public"],
    ["/privacy/aviso", "public"],
    ["/terms", "public"],
    ["/terms/uso", "public"],
    ["/", "protected"],
    ["/nope", "protected"],
    ["/loginx", "protected"],
    ["/dashboard", "protected"],
    ["/dashboard/x", "protected"],
  ] as const)("classifies %s as %s", (pathname, expected) => {
    expect(classify(pathname)).toBe(expected)
  })
})
