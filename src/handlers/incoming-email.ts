import { processReceivedEmail } from '../services/incoming-email'
import { SESEvent } from '../types'
import { logError } from '../utils/logging'

export const handleIncomingEmail = async (event: SESEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      await processReceivedEmail(record.ses.mail.messageId, record.ses.receipt.recipients, record.ses.mail.source)
    } catch (error: unknown) {
      logError(error)
    }
  }
}
