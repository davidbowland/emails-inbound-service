import { simpleParser } from 'mailparser'

import { Email, EmailAddress, EmailHeaders, ParsedMail } from '../types'
import { getAttachmentId } from './attachments'
import { getS3Object } from '../services/s3'

const emptyAddress: EmailAddress = {
  html: '',
  text: '',
  value: [
    {
      address: '',
      name: '',
    },
  ],
}

export const convertParsedContentsToEmail = (
  messageId: string,
  parsedMail: ParsedMail,
  recipients: string[]
): Email => ({
  attachments: parsedMail.attachments.map(getAttachmentId),
  bodyHtml: (parsedMail.html ?? parsedMail.textAsHtml) || '',
  bodyText: parsedMail.text ?? '',
  ccAddress: parsedMail.cc as unknown as EmailAddress,
  fromAddress: (parsedMail.from ?? emptyAddress) as EmailAddress,
  headers: parsedMail.headers as unknown as EmailHeaders,
  id: parsedMail.messageId ?? messageId,
  inReplyTo: parsedMail.inReplyTo,
  recipients,
  references: typeof parsedMail.references === 'string' ? [parsedMail.references] : parsedMail.references ?? [],
  replyToAddress: (parsedMail.replyTo ?? emptyAddress) as EmailAddress,
  subject: parsedMail.subject,
  toAddress: parsedMail.to as unknown as EmailAddress,
})

export const getParsedMail = (messageId: string): Promise<ParsedMail> =>
  getS3Object(`inbound/${messageId}`).then(simpleParser)
