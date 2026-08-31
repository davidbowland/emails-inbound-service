import { assertRequiredEnv } from '../config'
import { processReceivedEmail } from '../services/incoming-email'
import { SESEvent } from '../types'
import { logError } from '../utils/logging'

assertRequiredEnv(
  'DEFAULT_ACCOUNT_ID',
  'EMAILS_API_URL',
  'EMAIL_BUCKET',
  'EMAIL_FROM',
  'QUEUE_API_URL',
  'SSM_EMAILS_API_KEY_PATH',
  'SSM_QUEUE_API_KEY_PATH',
)

export const handleIncomingEmail = async (event: SESEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      await processReceivedEmail(record.ses.mail.messageId, record.ses.receipt.recipients, record.ses.mail.source)
    } catch (error: unknown) {
      logError(error)
    }
  }
}
