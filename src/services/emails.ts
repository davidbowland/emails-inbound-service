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

export const extractAccountFromAddress = (email: string): string => email.replace(/@[a-z0-9.-]+$/i, '').toLowerCase()

export const getAccountExists = (account: string): Promise<boolean> =>
  api
    .get(`/accounts/${encodeURIComponent(account.toLowerCase())}`, {
      headers: { 'x-api-key': emailsApiKey, 'x-user-name': account.toLowerCase() },
    })
    .then(() => true)
    .catch(() => false)

export const getAccountPreferences = (account: string): Promise<AccountPreference> =>
  api.get(`/accounts/${encodeURIComponent(account.toLowerCase())}/internal`).then((response: any) => response.data)

/* Emails */

const convertParsedMailToReceivedEmail = (parsedMail: ParsedMail, address: string): EmailReceived => {
  const cc = parsedMail.cc === undefined || Array.isArray(parsedMail.cc) ? parsedMail.cc : parsedMail.cc.value
  const to = parsedMail.to === undefined || Array.isArray(parsedMail.to) ? parsedMail.to : parsedMail.to.value

  return {
    attachments: parsedMail.attachments.map((file) => ({
      filename: file.filename ?? '',
      id: file.cid ?? file.checksum,
      size: file.size,
      type: file.contentType,
    })),
    cc: cc?.map((address: any) => address.address as string) ?? [],
    from: parsedMail.from?.text ?? 'unknown',
    subject: parsedMail.subject ?? '',
    timestamp: (parsedMail.date ?? new Date()).getTime(),
    to: to?.map((address: any) => address.address as string) ?? [address],
    viewed: false,
  }
}

export const registerReceivedEmail = (
  address: string,
  messageId: string,
  parsedMail: ParsedMail
): Promise<AxiosResponse> =>
  api.put(
    `/accounts/${encodeURIComponent(extractAccountFromAddress(address))}/emails/received/${encodeURIComponent(
      messageId
    )}`,
    convertParsedMailToReceivedEmail(parsedMail, address)
  )
