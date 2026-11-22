import { z } from 'zod'

import { isValidIsoDate } from '@/features/loans/domain/loan-schedule.calculator'

export const loanInterestModelSchema = z.enum([
  'OPEN_ENDED',
  'NO_INTEREST',
  'SINGLE_PAYMENT',
  'INTEREST_ONLY_BALLOON',
  'DECLINING_BALANCE',
])

const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => isValidIsoDate(value), {
    message: 'Debe ser una fecha válida en formato AAAA-MM-DD.',
  })

const optionalNotesSchema = z
  .union([
    z.string().trim().max(1000, 'Las notas no pueden superar 1000 caracteres.'),
    z.null(),
  ])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value === '') {
      return null
    }
    return value
  })

export const customInstallmentSchema = z.object({
  installmentNumber: z.number().int().min(1).optional(),
  dueDate: isoDateSchema,
  principalDue: z
    .number()
    .finite('El capital de la cuota debe ser un número válido.')
    .min(0, 'El capital de la cuota no puede ser negativo.'),
  interestDue: z
    .number()
    .finite('El interés de la cuota debe ser un número válido.')
    .min(0, 'El interés de la cuota no puede ser negativo.'),
  lateFeeDue: z
    .number()
    .finite('La mora de la cuota debe ser un número válido.')
    .min(0, 'La mora de la cuota no puede ser negativa.')
    .default(0),
})

export const createLoanSchema = z.object({
  contactId: z
    .string()
    .trim()
    .min(1, 'Debes seleccionar un contacto para el préstamo.'),
  principalAmount: z
    .number()
    .finite('El monto prestado debe ser un número válido.')
    .positive('El monto prestado debe ser mayor a 0.'),
  interestRate: z
    .number()
    .finite('La tasa de interés debe ser un número válido.')
    .min(0, 'La tasa de interés no puede ser negativa.')
    .max(1000, 'La tasa de interés no puede superar el 1000%.')
    .default(0),
  interestModel: loanInterestModelSchema,
  disbursementDate: isoDateSchema,
  monthlyBillingDay: z
    .number()
    .int('El día de cobro mensual debe ser un número entero.')
    .min(1, 'El día de cobro mensual debe estar entre 1 y 31.')
    .max(31, 'El día de cobro mensual debe estar entre 1 y 31.')
    .nullable()
    .optional(),
  installmentCount: z
    .number()
    .int('El número de cuotas debe ser un entero.')
    .min(1, 'Debe haber al menos 1 cuota.')
    .max(120, 'No se permiten más de 120 cuotas.')
    .optional(),
  dueDates: z.array(isoDateSchema).max(120).optional(),
  installments: z.array(customInstallmentSchema).max(120).optional(),
  notes: optionalNotesSchema,
})

export const registerLoanPaymentSchema = z.object({
  loanId: z.string().trim().min(1, 'El ID del préstamo es obligatorio.'),
  amount: z
    .number()
    .finite('El monto del abono debe ser un número válido.')
    .positive('El monto del abono debe ser mayor a 0.'),
  paidAt: z
    .string()
    .trim()
    .refine(
      (value) =>
        isValidIsoDate(value) || !Number.isNaN(new Date(value).getTime()),
      {
        message: 'La fecha del abono no es válida.',
      }
    )
    .optional(),
  notes: z
    .union([
      z
        .string()
        .trim()
        .max(500, 'Las notas del abono no pueden superar 500 caracteres.'),
      z.null(),
    ])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === '') {
        return null
      }
      return value
    }),
})

export const updateInstallmentSchema = z
  .object({
    loanId: z.string().trim().min(1, 'El ID del préstamo es obligatorio.'),
    installmentNumber: z
      .number()
      .int('El número de cuota debe ser un entero.')
      .min(1, 'El número de cuota debe ser mayor o igual a 1.'),
    dueDate: isoDateSchema.optional(),
    lateFeeDue: z
      .number()
      .finite('El recargo por mora debe ser un número válido.')
      .min(0, 'El recargo por mora no puede ser negativo.')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.dueDate === undefined && data.lateFeeDue === undefined) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Debes indicar una nueva fecha de vencimiento o un recargo por mora.',
        path: ['dueDate'],
      })
    }
  })

export const refinanceLoanSchema = z.object({
  loanId: z.string().trim().min(1, 'El ID del préstamo es obligatorio.'),
  principalAmount: z
    .number()
    .finite('El saldo a refinanciar debe ser un número válido.')
    .positive('El saldo a refinanciar debe ser mayor a 0.'),
  interestRate: z
    .number()
    .finite('La tasa de interés debe ser un número válido.')
    .min(0, 'La tasa de interés no puede ser negativa.')
    .max(1000, 'La tasa de interés no puede superar el 1000%.')
    .default(0),
  interestModel: loanInterestModelSchema,
  disbursementDate: isoDateSchema,
  monthlyBillingDay: z
    .number()
    .int('El día de cobro mensual debe ser un número entero.')
    .min(1, 'El día de cobro mensual debe estar entre 1 y 31.')
    .max(31, 'El día de cobro mensual debe estar entre 1 y 31.')
    .nullable()
    .optional(),
  installmentCount: z
    .number()
    .int('El número de cuotas debe ser un entero.')
    .min(1, 'Debe haber al menos 1 cuota.')
    .max(120, 'No se permiten más de 120 cuotas.')
    .optional(),
  dueDates: z.array(isoDateSchema).max(120).optional(),
  installments: z.array(customInstallmentSchema).max(120).optional(),
  notes: optionalNotesSchema,
})

export const voidLoanPaymentSchema = z.object({
  loanId: z.string().trim().min(1, 'El ID del préstamo es obligatorio.'),
  paymentId: z.string().trim().min(1, 'El ID del abono es obligatorio.'),
  reason: z
    .string()
    .trim()
    .min(5, 'El motivo de anulación debe tener al menos 5 caracteres.')
    .max(500, 'El motivo de anulación no puede superar 500 caracteres.'),
})

export const whatsAppTemplatesSchema = z.object({
  directLoanTemplate: z
    .string()
    .trim()
    .min(1, 'La plantilla para préstamo directo no puede estar vacía.')
    .max(1000, 'La plantilla no puede superar los 1000 caracteres.'),
  thirdPartyLoanTemplate: z
    .string()
    .trim()
    .min(1, 'La plantilla para préstamo a tercero no puede estar vacía.')
    .max(1000, 'La plantilla no puede superar los 1000 caracteres.'),
})

export type CreateLoanInput = z.input<typeof createLoanSchema>
export type RegisterLoanPaymentInput = z.input<typeof registerLoanPaymentSchema>
export type UpdateInstallmentInput = z.input<typeof updateInstallmentSchema>
export type RefinanceLoanInput = z.input<typeof refinanceLoanSchema>
export type VoidLoanPaymentInput = z.input<typeof voidLoanPaymentSchema>
export type UpdateWhatsAppTemplatesInput = z.input<
  typeof whatsAppTemplatesSchema
>
