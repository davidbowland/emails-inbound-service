import { AccountPreference, AttachmentCommon, Email } from '../types'
import { convertParsedContentsToEmail, getParsedMail } from '../utils/parser'
import { copyAttachmentsToAccount, getAttachmentId, uploadAttachments } from '../utils/attachments'
import { copyS3Object, deleteS3Object } from './s3'
import { extractAccountFromAddress, getAccountExists, registerReceivedEmail } from './emails'
import { aggregatePreferences } from '../utils/preferences'
import { forwardEmail } from '../utils/forwarding'
import { log } from '../utils/logging'

const applyPreferencesToEmail = async (
  preferences: AccountPreference,
  email: Email,
  attachments: AttachmentCommon[]
): Promise<void> => {
  if (preferences.forwardTargets) {
    await forwardEmail([...new Set(preferences.forwardTargets)], email, attachments)
  }
}

export const processReceivedEmail = async (messageId: string, recipients: string[]): Promise<void> => {
  const parsedMail = await getParsedMail(messageId)

  const preferences = await aggregatePreferences(recipients)
  log(`${messageId} to ${recipients} =>`, preferences)

  const attachments = await uploadAttachments(messageId, parsedMail.attachments)
  await applyPreferencesToEmail(
    preferences,
    convertParsedContentsToEmail(messageId, parsedMail, recipients),
    attachments
  )

  for (const address of recipients) {
    const accountId = extractAccountFromAddress(address)
    await registerReceivedEmail(address, messageId, parsedMail)
    await copyS3Object(`inbound/${messageId}`, `received/${accountId}/${messageId}`)
    await copyAttachmentsToAccount(accountId, messageId, parsedMail.attachments)
  }
  if (
    !(await Promise.all(recipients.map((address) => getAccountExists(extractAccountFromAddress(address))))).every(
      Boolean
    )
  ) {
    await registerReceivedEmail('admin', messageId, parsedMail)
    await copyS3Object(`inbound/${messageId}`, `received/admin/${messageId}`)
    await copyAttachmentsToAccount('admin', messageId, parsedMail.attachments)
  }
  await deleteS3Object(`inbound/${messageId}`)
  for (const attachment of parsedMail.attachments) {
    await deleteS3Object(`inbound/${messageId}/${getAttachmentId(attachment)}`)
  }
}
