import axios from 'axios'

import { emailFrom, queueApiKey, queueApiUrl } from '../config'
import { Attachment, AttachmentCommon, AxiosResponse, Email } from '../types'

const api = axios.create({
  baseURL: queueApiUrl,
})

/* Emails */

const convertEmailToJson = (target: string, email: Email, attachments: AttachmentCommon[]) => ({
  from: `"${email.fromAddress.value[0].name}" <${emailFrom}>`,
  sender: `"${email.fromAddress.value[0].name}" <${emailFrom}>`,
  to: [target],
  replyTo: email.replyToAddress.value[0].address || email.fromAddress.value[0].address,
  inReplyTo: email.inReplyTo,
  references: email.references,
  subject: email.subject,
  text: email.bodyText,
  html: email.bodyHtml,
  headers: email.headers,
  attachments: attachments as unknown as Attachment[],
})

export const sendEmail = (target: string, email: Email, attachments: AttachmentCommon[]): Promise<AxiosResponse> =>
  exports.sendRawEmail(convertEmailToJson(target, email, attachments))

export const sendRawEmail = (body: unknown): Promise<AxiosResponse> =>
  api.post('/emails', body, {
    headers: {
      'x-api-key': queueApiKey,
    },
  })
