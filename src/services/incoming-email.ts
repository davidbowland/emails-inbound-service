import { defaultAccountId } from '../config'
import { copyAttachmentsToAccount, getAttachmentId, uploadAttachments } from '../utils/attachments'
import { shouldBounceSender } from '../utils/bounce'
import { forwardEmail } from '../utils/forwarding'
import { log, logWarn } from '../utils/logging'
import { convertParsedContentsToEmail, getParsedMail } from '../utils/parser'
import {
  bounceReceivedEmail,
  extractAccountFromAddress,
  getAccount,
  notifyReceivedEmail,
  registerReceivedEmail,
} from './emails'
import { copyS3Object, deleteS3Object } from './s3'

interface RecipientProcessingResult {
  bouncedRecipients: Set<string>
  forwardTargets: Set<string>
  // Account ids, not addresses. Two addresses routinely resolve to one account -- two domains, two letter cases,
  // or an unresolvable address falling back to the default -- and a set of addresses dedupes none of those.
  notifyAccounts: Set<string>
  validRecipients: Set<string>
}

const processRecipients = async (recipients: string[], senderEmail: string): Promise<RecipientProcessingResult> => {
  const forwardTargets = new Set<string>()
  const bouncedRecipients = new Set<string>()
  const notifyAccounts = new Set<string>()
  const validRecipients = new Set<string>()

  const adminAccount = await getAccount(defaultAccountId)

  for (const recipient of recipients) {
    const accountId = extractAccountFromAddress(recipient)

    try {
      const account = await getAccount(accountId)

      validRecipients.add(recipient)
      if (shouldBounceSender(senderEmail, account.bounceSenders)) {
        bouncedRecipients.add(recipient)
      } else {
        notifyAccounts.add(accountId)
        account.forwardTargets?.forEach((target) => forwardTargets.add(target))
      }
    } catch {
      validRecipients.add(defaultAccountId)
      if (shouldBounceSender(senderEmail, adminAccount.bounceSenders)) {
        bouncedRecipients.add(recipient)
      } else {
        // The same normalization the resolvable path and the storage path use: the default account id is
        // configuration, so it may be an address, and an account id and an address must never both be added.
        notifyAccounts.add(extractAccountFromAddress(defaultAccountId))
        adminAccount.forwardTargets?.forEach((target) => forwardTargets.add(target))
      }
    }
  }

  return {
    bouncedRecipients,
    forwardTargets,
    notifyAccounts,
    validRecipients,
  }
}

export const processReceivedEmail = async (
  messageId: string,
  recipients: string[],
  senderEmail: string,
): Promise<void> => {
  const parsedMail = await getParsedMail(messageId)
  const { forwardTargets, bouncedRecipients, notifyAccounts, validRecipients } = await processRecipients(
    recipients,
    senderEmail,
  )

  const attachments = await uploadAttachments(messageId, parsedMail.attachments)

  for (const recipient of validRecipients) {
    const accountId = extractAccountFromAddress(recipient)
    await registerReceivedEmail(recipient, messageId, parsedMail)
    await copyS3Object(`inbound/${messageId}`, `received/${accountId}/${messageId}`)
    await copyAttachmentsToAccount(accountId, messageId, parsedMail.attachments)
  }

  for (const accountId of notifyAccounts) {
    try {
      await notifyReceivedEmail(accountId, messageId)
    } catch (error: any) {
      // A deliberate exception to "only catch expected exceptions": the email is already stored and copied to
      // S3, so letting this bubble up would re-run the whole inbound flow -- re-registering the email and
      // re-sending any forward. A missed notification is strictly cheaper than a duplicated email.
      // The status separates the three failures this endpoint actually produces -- 403 for a bad key, 404 for a
      // route that is not deployed, undefined for a network timeout -- without logging the error itself, which
      // would carry the x-api-key.
      logWarn('Unable to notify account of received email', { accountId, messageId, status: error?.response?.status })
    }
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
