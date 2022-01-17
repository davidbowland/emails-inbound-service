import { processReceivedEmail } from '../services/incoming-email'
import { SESEvent } from '../types'
import { sendErrorEmail } from '../utils/error-handling'

export const handleIncomingEmail = async (event: SESEvent): Promise<string> => {
  const promises = event.Records.map((record: any) =>
    processReceivedEmail(record.ses.mail.messageId, record.ses.receipt.recipients).catch((error) =>
      sendErrorEmail(record, error)
    )
  )
  const results = await Promise.all(promises)
  return results.reduce((previous: any, current: any): string => `${previous}\n${current}`, '') as string
}
