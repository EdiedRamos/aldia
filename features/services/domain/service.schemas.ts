import { z } from 'zod'

import { PERIOD_REGEX } from '@/core/domain/period'

const optionalPaymentUrlSchema = z
  .union([z.string().trim().url('Debe ser una URL válida.'), z.literal('')])
  .optional()

export const createServiceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre del servicio es obligatorio.')
    .max(120, 'El nombre no puede superar 120 caracteres.'),
  billingDay: z
    .number()
    .int('El día de corte debe ser un número entero.')
    .min(1, 'El día de corte debe estar entre 1 y 31.')
    .max(31, 'El día de corte debe estar entre 1 y 31.'),
  startPeriod: z
    .string()
    .regex(PERIOD_REGEX, 'El periodo inicial debe tener el formato YYYY-MM.'),
  paymentUrl: optionalPaymentUrlSchema,
  referenceCode: z
    .string()
    .trim()
    .max(120, 'La referencia no puede superar 120 caracteres.')
    .optional(),
})

export const updateServiceSchema = createServiceSchema
  .extend({
    status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  })
  .partial()

export const registerPaymentSchema = z.object({
  serviceId: z.string().trim().min(1, 'El ID del servicio es obligatorio.'),
  startPeriod: z
    .string()
    .regex(PERIOD_REGEX, 'El periodo debe tener el formato YYYY-MM.')
    .optional(),
  monthsCovered: z
    .number()
    .int('La cantidad de meses debe ser un número entero.')
    .min(1, 'Debe cubrir al menos 1 mes.')
    .default(1),
  receiptUrl: z
    .string()
    .trim()
    .url('La URL del comprobante debe ser válida.')
    .optional(),
  receiptType: z.string().trim().min(1).optional(),
  receiptPath: z.string().trim().min(1).optional(),
})

export type CreateServiceInput = z.infer<typeof createServiceSchema>
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>
export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>
