import axios from 'axios'

import { emailFrom, queueApiKey, queueApiUrl } from '../config'
import { Attachment, AttachmentCommon, AxiosResponse, Email } from '../types'
import { xrayCaptureHttps } from '../utils/logging'

xrayCaptureHttps()
const api = axios.create({
  baseURL: queueApiUrl,
  headers: { 'x-api-key': queueApiKey },
})

/* Emails */

const convertEmailToJson = (target: string, email: Email, attachments: AttachmentCommon[]): unknown => ({
  attachments: attachments as unknown as Attachment[],
  from: `"${email.fromAddress.value[0].name}" <${emailFrom}>`,
  headers: email.headers,
  html: email.bodyHtml,
  inReplyTo: email.inReplyTo,
  references: email.references,
  replyTo: email.replyToAddress.value[0]?.address || email.fromAddress.value[0].address,
  sender: `"${email.fromAddress.value[0].name}" <${emailFrom}>`,
  subject: email.subject,
  text: email.bodyText,
  to: [target],
})

export const sendEmail = (target: string, email: Email, attachments: AttachmentCommon[]): Promise<AxiosResponse> =>
  api.post('/emails', convertEmailToJson(target, email, attachments), {})
