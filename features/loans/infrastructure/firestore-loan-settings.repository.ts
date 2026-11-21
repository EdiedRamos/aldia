import 'server-only'
import { FieldValue } from 'firebase-admin/firestore'

import type { ILoanSettingsRepository } from '@/features/loans/domain/loan.repository'
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  type WhatsAppMessageTemplates,
} from '@/features/loans/domain/loan-whatsapp-template'
import { getAdminDb } from '@/lib/firebase-admin'

const USERS_COLLECTION = 'users'
const SETTINGS_SUBCOLLECTION = 'settings'
const WHATSAPP_TEMPLATES_DOC_ID = 'whatsappTemplates'

function getTemplatesDocRef(userId: string) {
  return getAdminDb()
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection(SETTINGS_SUBCOLLECTION)
    .doc(WHATSAPP_TEMPLATES_DOC_ID)
}

export class FirestoreLoanSettingsRepository implements ILoanSettingsRepository {
  async getWhatsAppTemplates(
    userId: string
  ): Promise<WhatsAppMessageTemplates> {
    const snapshot = await getTemplatesDocRef(userId).get()

    if (!snapshot.exists) {
      return { ...DEFAULT_WHATSAPP_TEMPLATES }
    }

    const data = snapshot.data() ?? {}
    const directLoanTemplate =
      typeof data.directLoanTemplate === 'string' &&
      data.directLoanTemplate.trim().length > 0
        ? data.directLoanTemplate.trim()
        : DEFAULT_WHATSAPP_TEMPLATES.directLoanTemplate

    const thirdPartyLoanTemplate =
      typeof data.thirdPartyLoanTemplate === 'string' &&
      data.thirdPartyLoanTemplate.trim().length > 0
        ? data.thirdPartyLoanTemplate.trim()
        : DEFAULT_WHATSAPP_TEMPLATES.thirdPartyLoanTemplate

    return {
      directLoanTemplate,
      thirdPartyLoanTemplate,
    }
  }

  async saveWhatsAppTemplates(
    userId: string,
    templates: WhatsAppMessageTemplates
  ): Promise<WhatsAppMessageTemplates> {
    const payload: WhatsAppMessageTemplates = {
      directLoanTemplate: templates.directLoanTemplate.trim(),
      thirdPartyLoanTemplate: templates.thirdPartyLoanTemplate.trim(),
    }

    await getTemplatesDocRef(userId).set(
      {
        ...payload,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return payload
  }
}

export const firestoreLoanSettingsRepository =
  new FirestoreLoanSettingsRepository()
