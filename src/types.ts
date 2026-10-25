import type { Attachment as ParsedAttachment } from 'mailparser'

// Type-only re-exports: aws-lambda ships no runtime code, so a value re-export would fail at runtime. Runtime
// constants (such as DEFAULT_SPAM_FILTER) live in utils or config, never here.
export type * from 'aws-lambda'
export type { AxiosResponse } from 'axios'
export type { AddressObject, EmailAddress as ParsedEmailAddress, ParsedMail } from 'mailparser'
export type { ParsedAttachment }
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

// A parsed attachment once uploaded to S3: `content` holds its S3 key in place of the bytes
export type UploadedAttachment = Omit<ParsedAttachment, 'content'> & { content: string }

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
