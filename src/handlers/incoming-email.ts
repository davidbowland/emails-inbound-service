import { processReceivedEmail } from '../services/incoming-email-processing'
import { SESEvent } from '../types'
import { sendErrorEmail } from '../utils/error-handling'

export const handleIncomingEmail = (event: SESEvent): Promise<string> =>
  Promise.all(
    event.Records.map((record: any) =>
      processReceivedEmail(record.ses.mail.messageId, record.ses.receipt.recipients).catch((error) =>
        sendErrorEmail(record, error)
      )
    )
  ).then(
    (results): string =>
      results.reduce((previous: any, current: any): string => `${previous}\n${current}`, '') as string
  )
