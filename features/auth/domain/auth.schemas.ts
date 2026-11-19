import { z } from 'zod'

export const createSessionPayloadSchema = z.object({
  idToken: z
    .string({ error: 'Token de sesión requerido.' })
    .trim()
    .min(1, 'Token de sesión requerido.'),
})

export type CreateSessionPayload = z.infer<typeof createSessionPayloadSchema>
