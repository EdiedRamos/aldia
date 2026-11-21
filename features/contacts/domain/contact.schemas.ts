import { z } from 'zod'

import { tryNormalizePhoneToE164 } from '@/features/contacts/domain/contact.entity'

const optionalNullablePhoneSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value, ctx): string | null | undefined => {
    if (value === undefined) {
      return undefined
    }
    if (value === null) {
      return null
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    const normalized = tryNormalizePhoneToE164(trimmed)
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Ingresa un número de teléfono válido (ej. 300 123 4567 o +57 300 123 4567).',
      })
      return z.NEVER
    }

    return normalized
  })

const optionalNullableIdSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value): string | null | undefined => {
    if (value === undefined) {
      return undefined
    }
    if (value === null) {
      return null
    }
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  })

const optionalNullableNotesSchema = z
  .union([
    z.string().trim().max(500, 'Las notas no pueden superar 500 caracteres.'),
    z.null(),
  ])
  .optional()
  .transform((value): string | null | undefined => {
    if (value === undefined) {
      return undefined
    }
    if (value === null) {
      return null
    }
    return value ? value : null
  })

export const createContactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'El nombre del contacto es obligatorio.')
      .max(120, 'El nombre no puede superar 120 caracteres.'),
    phone: optionalNullablePhoneSchema.transform((value) => value ?? null),
    guarantorContactId: optionalNullableIdSchema.transform(
      (value) => value ?? null
    ),
    notes: optionalNullableNotesSchema.transform((value) => value ?? null),
  })
  .superRefine((data, ctx) => {
    if (!data.phone && !data.guarantorContactId) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message:
          'Debes ingresar un teléfono propio o seleccionar un intermediario/codeudor.',
      })
    }
  })

export const updateContactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'El nombre del contacto es obligatorio.')
      .max(120, 'El nombre no puede superar 120 caracteres.')
      .optional(),
    phone: optionalNullablePhoneSchema,
    guarantorContactId: optionalNullableIdSchema,
    notes: optionalNullableNotesSchema,
    removePhoto: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.phone === null && data.guarantorContactId === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message:
          'Debes mantener un teléfono propio o un intermediario/codeudor.',
      })
    }
  })

export type CreateContactInput = z.input<typeof createContactSchema>
export type ParsedCreateContactInput = z.output<typeof createContactSchema>
export type UpdateContactInput = z.input<typeof updateContactSchema>
export type ParsedUpdateContactInput = z.output<typeof updateContactSchema>
