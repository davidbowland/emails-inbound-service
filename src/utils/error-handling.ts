import escape from 'escape-html'

import { emailFrom, notificationTarget } from '../config'
import { logError } from './logging'
import { sendRawEmail } from '../services/queue'
import { SESEventRecord } from '../types'

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
      sender: emailFrom,
      to: [notificationTarget],
      replyTo: emailFrom,
      subject: 'Error processing SES inbound',
      text,
      html: `<p>${text.replace(/\n/g, '<br>')}</p>`,
    })
  } catch (error) {
    logError(error)
  }
  return `${error}`
}
