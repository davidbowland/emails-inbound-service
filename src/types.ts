export * from 'aws-lambda'
export { AxiosResponse } from 'axios'
export { AttachmentCommon, ParsedMail } from 'mailparser'
export { Attachment } from 'nodemailer/lib/mailer'

export interface AccountInboundPreference {
  forwardTargets?: string[] | Set<string>
  save: boolean
}

export interface AccountOutboundPreference {
  ccTargets?: string[]
  save: boolean
}

export interface AccountPreference {
  inbound?: AccountInboundPreference
  outbound?: AccountOutboundPreference
}

export interface EmailAddress {
  display: string
  value: {
    address: string
    group?: string[]
    name: string
  }[]
}

export interface EmailHeaders {
  [key: string]: string
}

export interface Email {
  attachments: string[]
  bodyHtml: string
  bodyText: string
  ccAddress?: EmailAddress
  fromAddress: EmailAddress
  headers: EmailHeaders
  id: string
  inReplyTo?: string
  recipients: string[]
  references: string[]
  replyToAddress: EmailAddress
  subject?: string
  toAddress?: EmailAddress
}

export interface StringObject {
  [key: string]: string
}
