import escape from 'escape-html'

import { emailFrom, notificationTarget } from '../config'
import { SESEventRecord } from '../types'
import { logError } from './logging'
import { sendRawEmail } from '../services/queue'

/* Email */

const getErrorText = (record: SESEventRecord, error: Error): string =>
  `There was an error processing SES inbound message ID: ${escape(
    record.ses.mail.messageId
  )}\n\nAt ${new Date().toISOString()} encountered error: ${escape(error as unknown as string)}\n${escape(error.stack)}`

export const sendErrorEmail = async (record: SESEventRecord, error: Error): Promise<string> => {
  try {
    const text = await getErrorText(record, error)
    await sendRawEmail({
      from: emailFrom,
      html: `<p>${text.replace(/\n/g, '<br>')}</p>`,
      replyTo: emailFrom,
      sender: emailFrom,
      subject: 'Error processing SES inbound',
      text,
      to: [notificationTarget],
    })
  } catch (error) {
    logError(error)
  }
  return `${error}`
}
