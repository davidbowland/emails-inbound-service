// Type-only re-exports: aws-lambda ships no runtime code, so a value re-export would fail at runtime. Runtime
// constants (such as DEFAULT_SPAM_FILTER) live in utils or config, never here.
export type * from 'aws-lambda'
export type { AxiosResponse } from 'axios'
export type { AddressObject, AttachmentCommon, EmailAddress as ParsedEmailAddress, ParsedMail } from 'mailparser'
export type { Attachment } from 'nodemailer/lib/mailer'

export type SpamSensitivity = 'low' | 'medium' | 'high'

export interface SpamFilter {
  blockPhrases: string[]
  sensitivity: SpamSensitivity
  trustedSenders: string[]
}

export interface Account {
  bounceSenders: string[]
  forwardTargets?: string[]
  // Absent on accounts created before the spam filter; read as DEFAULT_SPAM_FILTER
  spamFilter?: SpamFilter
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

export type EmailFolder = 'inbox' | 'spam'

export interface EmailReceived {
  attachments?: EmailAttachment[]
  bcc?: string[]
  cc?: string[]
  folder: EmailFolder
  from: string
  subject: string
  timestamp: number
  to: string[]
  viewed: boolean
}

export interface StringObject {
  [key: string]: string
}
