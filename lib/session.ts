import { SignJWT, jwtVerify } from "jose"

export const SESSION_COOKIE_NAME = "aldia_session"
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7

export type SessionPayload = {
  email: string
  name: string
  picture?: string
  uid: string
}

function getEncodedKey() {
  const secret = process.env.SESSION_SECRET

  if (!secret) {
    throw new Error("SESSION_SECRET no está configurado")
  }

  return new TextEncoder().encode(secret)
}

export async function encryptSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getEncodedKey())
}

export async function decryptSession(token: string | undefined) {
  if (!token) {
    return null
  }

  try {
    const { payload } = await jwtVerify(token, getEncodedKey(), {
      algorithms: ["HS256"],
    })

    return payload as SessionPayload & { exp: number }
  } catch {
    return null
  }
}
