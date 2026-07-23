import axios from 'axios'

import { emailsApiKey, emailsApiUrl } from '../config'
import { Account, AddressObject, AxiosResponse, EmailReceived, ParsedEmailAddress, ParsedMail } from '../types'
import { logWarn, xrayCaptureHttps } from '../utils/logging'

xrayCaptureHttps()
const api = axios.create({
  baseURL: emailsApiUrl,
  headers: { 'x-api-key': emailsApiKey },
})

/* Accounts */

export const extractAccountFromAddress = (email: string): string => email.replace(/@[a-z0-9.-]+$/i, '').toLowerCase()

export const getAccount = (account: string): Promise<Account> =>
  api.get(`/accounts/${encodeURIComponent(account.toLowerCase())}`).then((response: any) => response.data)

/* Emails */

// Addresses arrive in several mailparser shapes: a single AddressObject, an array of them when a header is
// repeated, and entries that nest their addresses inside an RFC 5322 group (e.g. "undisclosed-recipients:;")
const flattenEmailAddresses = (addresses: ParsedEmailAddress[]): (string | undefined)[] =>
  addresses.flatMap((address) =>
    address.group === undefined ? [address.address] : flattenEmailAddresses(address.group),
  )

const extractAddresses = (addressObject: AddressObject | AddressObject[] | undefined): string[] => {
  const addressObjects = addressObject === undefined ? [] : [addressObject].flat()

  return flattenEmailAddresses(addressObjects.flatMap((object) => object.value)).filter(
    (address): address is string => typeof address === 'string' && address.trim() !== '',
  )
}

const convertParsedMailToReceivedEmail = (parsedMail: ParsedMail, address: string): EmailReceived => {
  const cc = extractAddresses(parsedMail.cc)
  const to = extractAddresses(parsedMail.to)

  const validAttachments = parsedMail.attachments.filter((file) => {
    const hasValidFilename = file.filename && file.filename.trim() !== ''
    if (!hasValidFilename) {
      logWarn(
        `Attachment filtered out due to missing or empty filename. ID: ${file.cid ?? file.checksum}, Type: ${file.contentType}`,
      )
    }
    return hasValidFilename
  })

  return {
    attachments: validAttachments.map((file) => ({
      filename: file.filename!,
      id: file.cid ?? file.checksum,
      size: file.size,
      type: file.contentType,
    })),
    cc,
    from: parsedMail.from?.text ?? 'unknown',
    subject: parsedMail.subject ?? '',
    timestamp: (parsedMail.date ?? new Date()).getTime(),
    // The API requires at least one addressee; bcc-only mail parses to an empty "to", so keep the SES recipient
    to: to.length > 0 ? to : [address],
    viewed: false,
  }
}

export const registerReceivedEmail = (
  address: string,
  messageId: string,
  parsedMail: ParsedMail,
): Promise<AxiosResponse> =>
  api.put(
    `/accounts/${encodeURIComponent(extractAccountFromAddress(address))}/emails/received/${encodeURIComponent(
      messageId,
    )}`,
    convertParsedMailToReceivedEmail(parsedMail, address),
  )

/* Bounces */

export const bounceReceivedEmail = (address: string, messageId: string): Promise<AxiosResponse> =>
  api.post(
    `/accounts/${encodeURIComponent(extractAccountFromAddress(address))}/emails/received/${encodeURIComponent(
      messageId,
    )}/bounce`,
    {},
  )
