export * from 'aws-lambda'
export { AxiosResponse } from 'axios'
export { AttachmentCommon, ParsedMail } from 'mailparser'
export { Attachment } from 'nodemailer/lib/mailer'

export interface Account {
  bounceSenders: string[]
  forwardTargets?: string[]
}

export interface EmailAddress {
  html: string
  text: string
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

export interface EmailAttachment {
  filename: string
  id: string
  size: number
  type: string
}

export interface EmailReceived {
  attachments?: EmailAttachment[]
  bcc?: string[]
  cc?: string[]
  from: string
  subject: string
  timestamp: number
  to: string[]
  viewed: boolean
}

export interface StringObject {
  [key: string]: string
}
