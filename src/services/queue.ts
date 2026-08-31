import axios from 'axios'

import { emailFrom, queueApiKeyPath, queueApiUrl } from '../config'
import { Attachment, AttachmentCommon, AxiosResponse, Email } from '../types'
import { xrayCaptureHttps } from '../utils/logging'
import { getParameter, memoized } from './ssm'

xrayCaptureHttps()
const api = axios.create({ baseURL: queueApiUrl })

const getQueueApiKey = memoized(() => getParameter(queueApiKeyPath))

// The key is read from SSM, so it cannot be baked into the instance at import time. An interceptor keeps
// every call site synchronous and the header can never be stale.
api.interceptors.request.use(async (config) => {
  config.headers['x-api-key'] = await getQueueApiKey()
  return config
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
