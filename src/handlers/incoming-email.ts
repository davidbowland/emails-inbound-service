import { processReceivedEmail } from '../services/incoming-email'
import { SESEvent } from '../types'
import { sendErrorEmail } from '../utils/error-handling'
import { logError } from '../utils/logging'

const processRecord = async (record: any) => {
  try {
    await processReceivedEmail(record.ses.mail.messageId, record.ses.receipt.recipients)
  } catch (error) {
    logError(error)
    sendErrorEmail(record, error)
  }
}

export const handleIncomingEmail = async (event: SESEvent): Promise<string> => {
  const promises = event.Records.map(processRecord)
  const results = await Promise.all(promises)
  return results.reduce((previous: any, current: any): string => `${previous}\n${current}`, '') as string
}
