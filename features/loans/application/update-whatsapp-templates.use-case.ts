import type { ILoanSettingsRepository } from '@/features/loans/domain/loan.repository'
import {
  whatsAppTemplatesSchema,
  type UpdateWhatsAppTemplatesInput,
} from '@/features/loans/domain/loan.schemas'
import type { WhatsAppMessageTemplates } from '@/features/loans/domain/loan-whatsapp-template'

export interface UpdateWhatsAppTemplatesDependencies {
  loanSettingsRepository: ILoanSettingsRepository
}

export async function updateWhatsAppTemplatesUseCase(
  userId: string,
  rawInput: UpdateWhatsAppTemplatesInput,
  { loanSettingsRepository }: UpdateWhatsAppTemplatesDependencies
): Promise<WhatsAppMessageTemplates> {
  const validated = whatsAppTemplatesSchema.parse(rawInput)
  return loanSettingsRepository.saveWhatsAppTemplates(userId, validated)
}
