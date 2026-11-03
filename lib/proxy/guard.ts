import { NextResponse, type NextRequest } from "next/server"

import { classify } from "@/lib/proxy/routes"
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session"

export async function guard(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = token ? await decryptSession(token) : null
  const staleSession = Boolean(token) && !session
  const policy = classify(pathname)

  let response: NextResponse

  if (policy === "guest-only") {
    response = session
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next()
  } else if (policy === "public" || session) {
    response = NextResponse.next()
  } else {
    response = NextResponse.redirect(new URL("/login", request.url))
  }

  if (staleSession) {
    response.cookies.delete(SESSION_COOKIE_NAME)
  }

  return response
}
