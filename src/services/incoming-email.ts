import { defaultAccountId } from '../config'
import { copyAttachmentsToAccount, getAttachmentId, uploadAttachments } from '../utils/attachments'
import { shouldBounceSender } from '../utils/bounce'
import { forwardEmail } from '../utils/forwarding'
import { log } from '../utils/logging'
import { convertParsedContentsToEmail, getParsedMail } from '../utils/parser'
import { bounceReceivedEmail, extractAccountFromAddress, getAccount, registerReceivedEmail } from './emails'
import { copyS3Object, deleteS3Object } from './s3'

interface RecipientProcessingResult {
  bouncedRecipients: Set<string>
  forwardTargets: Set<string>
  validRecipients: Set<string>
}

const processRecipients = async (recipients: string[], senderEmail: string): Promise<RecipientProcessingResult> => {
  const forwardTargets = new Set<string>()
  const bouncedRecipients = new Set<string>()
  const validRecipients = new Set<string>()

  const adminAccount = await getAccount(defaultAccountId)

  for (const recipient of recipients) {
    const accountId = extractAccountFromAddress(recipient)

    try {
      const account = await getAccount(accountId)

      validRecipients.add(recipient)
      account.forwardTargets?.forEach((target) => forwardTargets.add(target))
      if (shouldBounceSender(senderEmail, account.bounceSenders)) {
        bouncedRecipients.add(recipient)
      }
    } catch {
      validRecipients.add(defaultAccountId)
      adminAccount.forwardTargets?.forEach((target) => forwardTargets.add(target))
      if (shouldBounceSender(senderEmail, adminAccount.bounceSenders)) {
        bouncedRecipients.add(recipient)
      }
    }
  }

  return {
    bouncedRecipients,
    forwardTargets,
    validRecipients,
  }
}

export const processReceivedEmail = async (
  messageId: string,
  recipients: string[],
  senderEmail: string,
): Promise<void> => {
  const parsedMail = await getParsedMail(messageId)
  const { forwardTargets, bouncedRecipients, validRecipients } = await processRecipients(recipients, senderEmail)

  const attachments = await uploadAttachments(messageId, parsedMail.attachments)

  for (const recipient of validRecipients) {
    const accountId = extractAccountFromAddress(recipient)
    await registerReceivedEmail(recipient, messageId, parsedMail)
    await copyS3Object(`inbound/${messageId}`, `received/${accountId}/${messageId}`)
    await copyAttachmentsToAccount(accountId, messageId, parsedMail.attachments)
  }

  if (forwardTargets.size > 0) {
    const targetArray = [...forwardTargets]
    log('Forwarding email', { forwardTargets: targetArray.length, messageId })
    await forwardEmail(
      targetArray,
      convertParsedContentsToEmail(messageId, parsedMail, [...validRecipients]),
      attachments,
    )
  }

  for (const address of bouncedRecipients) {
    const accountId = extractAccountFromAddress(address)
    log('Bouncing email', { accountId, messageId })
    await registerReceivedEmail(address, messageId, parsedMail)
    await bounceReceivedEmail(address, messageId)
  }

  await deleteS3Object(`inbound/${messageId}`)
  for (const attachment of parsedMail.attachments) {
    await deleteS3Object(`inbound/${messageId}/${getAttachmentId(attachment)}`)
  }
}
