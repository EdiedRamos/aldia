export interface WhatsAppMessageTemplates {
  directLoanTemplate: string
  thirdPartyLoanTemplate: string
}

export const DEFAULT_DIRECT_LOAN_TEMPLATE =
  'Hola {{nombre}} \u{1F44B}, te recuerdo que el *{{fecha}}* vence tu pago por *{{monto}}* (saldo pendiente: {{saldo}}). ¡Quedo atento! \u{1F60A}'

export const DEFAULT_THIRD_PARTY_LOAN_TEMPLATE =
  'Hola {{nombre}} \u{1F44B}, te escribo respecto al préstamo de {{deudor}}. El *{{fecha}}* vence el pago por *{{monto}}* (saldo pendiente: {{saldo}}). ¡Muchas gracias! \u{1F64F}'

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppMessageTemplates = {
  directLoanTemplate: DEFAULT_DIRECT_LOAN_TEMPLATE,
  thirdPartyLoanTemplate: DEFAULT_THIRD_PARTY_LOAN_TEMPLATE,
}

export const MAX_WHATSAPP_TEMPLATE_LENGTH = 1000

export type WhatsAppTemplateVariableKey =
  'nombre' | 'deudor' | 'monto' | 'fecha' | 'saldo'

export interface WhatsAppTemplateVariableMeta {
  key: WhatsAppTemplateVariableKey
  token: `{{${WhatsAppTemplateVariableKey}}}`
  label: string
}

export const WHATSAPP_TEMPLATE_VARIABLES: readonly WhatsAppTemplateVariableMeta[] =
  [
    {
      key: 'nombre',
      token: '{{nombre}}',
      label: 'Destinatario',
    },
    {
      key: 'deudor',
      token: '{{deudor}}',
      label: 'Deudor',
    },
    {
      key: 'monto',
      token: '{{monto}}',
      label: 'Monto a pagar',
    },
    {
      key: 'fecha',
      token: '{{fecha}}',
      label: 'Fecha vencimiento',
    },
    {
      key: 'saldo',
      token: '{{saldo}}',
      label: 'Saldo pendiente',
    },
  ] as const

export interface RenderWhatsAppLoanMessageParams {
  template: string
  recipientName: string
  debtorName: string
  amountFormatted: string
  dueDateFormatted: string
  remainingPrincipalFormatted: string
}

const TEMPLATE_VARIABLE_REGEX = /\{\{(nombre|deudor|monto|fecha|saldo)\}\}/g

/**
 * Pure renderer that safely interpolates supported WhatsApp template variables
 * (`{{nombre}}`, `{{deudor}}`, `{{monto}}`, `{{fecha}}`, `{{saldo}}`).
 * Missing variables in the template are ignored safely, and literal replacement
 * values containing braces are never re-evaluated.
 */
export function renderWhatsAppLoanMessage({
  template,
  recipientName,
  debtorName,
  amountFormatted,
  dueDateFormatted,
  remainingPrincipalFormatted,
}: RenderWhatsAppLoanMessageParams): string {
  const safeTemplate = typeof template === 'string' ? template : ''
  const values: Record<WhatsAppTemplateVariableKey, string> = {
    nombre: recipientName ?? '',
    deudor: debtorName ?? '',
    monto: amountFormatted ?? '',
    fecha: dueDateFormatted ?? '',
    saldo: remainingPrincipalFormatted ?? '',
  }

  return safeTemplate
    .replace(TEMPLATE_VARIABLE_REGEX, (_match, key: string) => {
      return values[key as WhatsAppTemplateVariableKey] ?? ''
    })
    .trim()
}

/**
 * Builds a WhatsApp Web / Mobile send URL using `https://api.whatsapp.com/send`
 * to ensure full UTF-8 emoji preservation across desktop and mobile clients.
 */
export function buildWhatsAppSendUrl(
  phoneE164: string,
  message: string
): string {
  const cleanPhone = phoneE164.replace(/\D/g, '')
  const trimmedMessage = message.trim()

  if (!trimmedMessage) {
    return `https://api.whatsapp.com/send?phone=${cleanPhone}`
  }

  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(trimmedMessage)}`
}

export interface BuildTemplatedLoanWhatsAppUrlParams {
  phone: string
  templates: WhatsAppMessageTemplates
  isViaIntermediary: boolean
  contactName: string
  guarantorName?: string | null
  amountFormatted: string
  dueDateFormatted: string
  remainingPrincipalFormatted: string
}

/**
 * Selects the appropriate template (direct vs. third-party/intermediary),
 * renders the personalized Spanish reminder message, and builds a UTF-8 safe
 * `https://api.whatsapp.com/send` URL.
 */
export function buildTemplatedLoanWhatsAppUrl({
  phone,
  templates,
  isViaIntermediary,
  contactName,
  guarantorName,
  amountFormatted,
  dueDateFormatted,
  remainingPrincipalFormatted,
}: BuildTemplatedLoanWhatsAppUrlParams): string {
  const template = isViaIntermediary
    ? templates.thirdPartyLoanTemplate
    : templates.directLoanTemplate

  const recipientName =
    isViaIntermediary && guarantorName ? guarantorName : contactName

  const renderedMessage = renderWhatsAppLoanMessage({
    template,
    recipientName,
    debtorName: contactName,
    amountFormatted,
    dueDateFormatted,
    remainingPrincipalFormatted,
  })

  return buildWhatsAppSendUrl(phone, renderedMessage)
}
