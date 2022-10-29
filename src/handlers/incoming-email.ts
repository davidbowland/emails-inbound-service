import { SESEvent } from '../types'
import { logError } from '../utils/logging'
import { processReceivedEmail } from '../services/incoming-email'

export const handleIncomingEmail = async (event: SESEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      await processReceivedEmail(record.ses.mail.messageId, record.ses.receipt.recipients)
    } catch (error: any) {
      logError(error)
    }
  }
}
