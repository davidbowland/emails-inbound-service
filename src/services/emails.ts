import axios from 'axios'

import { AccountPreference, AxiosResponse, EmailReceived, ParsedMail } from '../types'
import { emailsApiKey, emailsApiUrl } from '../config'
import { xrayCaptureHttps } from '../utils/logging'

xrayCaptureHttps()
const api = axios.create({
  baseURL: emailsApiUrl,
  headers: { 'x-api-key': emailsApiKey },
})

/* Accounts */

export const extractAccountFromAddress = (email: string): string => email.replace(/@[a-z0-9.-]+$/i, '')

export const getAccountPreferences = (account: string): Promise<AccountPreference> =>
  api.get(`/accounts/${encodeURIComponent(account.toLowerCase())}/internal`).then((response: any) => response.data)

/* Emails */

const convertParsedMailToReceivedEmail = (parsedMail: ParsedMail): EmailReceived => {
  const cc = parsedMail.cc === undefined || Array.isArray(parsedMail.cc) ? parsedMail.cc : [parsedMail.cc]
  const to = parsedMail.to === undefined || Array.isArray(parsedMail.to) ? parsedMail.to : [parsedMail.to]

  return {
    attachments: parsedMail.attachments.map((file) => ({
      filename: file.filename ?? '',
      id: file.cid ?? file.checksum,
      size: file.size,
      type: file.contentType,
    })),
    cc: cc?.map((address) => address.text as string) ?? [],
    from: parsedMail.from?.text ?? 'unknown',
    subject: parsedMail.subject ?? '',
    timestamp: (parsedMail.date ?? new Date()).getTime(),
    to: to?.map((address) => address.text as string) ?? [],
    viewed: false,
  }
}

export const registerReceivedEmail = (
  messageId: string,
  account: string,
  parsedMail: ParsedMail
): Promise<AxiosResponse> =>
  api.put(
    `/accounts/${encodeURIComponent(account.toLowerCase())}/emails/received/${encodeURIComponent(messageId)}`,
    convertParsedMailToReceivedEmail(parsedMail)
  )
