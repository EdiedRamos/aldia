import type { ILoanSettingsRepository } from '@/features/loans/domain/loan.repository'
import type { WhatsAppMessageTemplates } from '@/features/loans/domain/loan-whatsapp-template'

export interface GetWhatsAppTemplatesDependencies {
  loanSettingsRepository: ILoanSettingsRepository
}

export async function getWhatsAppTemplatesUseCase(
  userId: string,
  { loanSettingsRepository }: GetWhatsAppTemplatesDependencies
): Promise<WhatsAppMessageTemplates> {
  return loanSettingsRepository.getWhatsAppTemplates(userId)
}
