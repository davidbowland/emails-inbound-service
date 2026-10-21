import { defaultAccountId } from '../config'
import { Account, ParsedMail, SESReceipt } from '../types'
import { copyAttachmentsToAccount, getAttachmentId, uploadAttachments } from '../utils/attachments'
import { shouldBounceSender } from '../utils/bounce'
import { forwardEmail } from '../utils/forwarding'
import { log, logWarn } from '../utils/logging'
import { convertParsedContentsToEmail, getParsedMail } from '../utils/parser'
import { classifyEmail, DEFAULT_SPAM_FILTER } from '../utils/spam-score'
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
  // Members of validRecipients whose copy is filed to the Spam folder
  spamRecipients: Set<string>
  validRecipients: Set<string>
}

interface RecipientTarget {
  account: Account
  accountId: string
  // The value added to validRecipients: the address itself, or the default account id for the fallback
  storedAs: string
}

// SES spam or virus FAIL is a hard verdict (D-8): never forwarded, never bounced, always filed to Spam (D-4)
const isSesFail = (receipt: SESReceipt): boolean =>
  receipt.spamVerdict?.status === 'FAIL' || receipt.virusVerdict?.status === 'FAIL'

const getRecipientDomains = (recipients: string[]): string[] => [
  ...new Set(
    recipients
      .filter((recipient) => recipient.includes('@'))
      .map((recipient) => recipient.replace(/^.*@/, '').toLowerCase()),
  ),
]

// Only the lookup is guarded: an unknown address falls back to the default account, but a classification error
// must propagate so the handler logs it and nothing is forwarded
const getAccountOrUndefined = async (accountId: string): Promise<Account | undefined> => {
  try {
    return await getAccount(accountId)
  } catch {
    return undefined
  }
}

const processRecipients = async (
  messageId: string,
  receipt: SESReceipt,
  envelopeSender: string,
  parsedMail: ParsedMail,
  sesFail: boolean,
): Promise<RecipientProcessingResult> => {
  const forwardTargets = new Set<string>()
  const bouncedRecipients = new Set<string>()
  const notifyAccounts = new Set<string>()
  const spamRecipients = new Set<string>()
  const validRecipients = new Set<string>()

  const adminAccount = await getAccount(defaultAccountId)
  const recipientDomains = getRecipientDomains(receipt.recipients)

  for (const recipient of receipt.recipients) {
    const accountId = extractAccountFromAddress(recipient)
    const account = await getAccountOrUndefined(accountId)
    // The same normalization the resolvable path and the storage path use: the default account id is
    // configuration, so it may be an address, and an account id and an address must never both be added.
    const target: RecipientTarget =
      account === undefined
        ? { account: adminAccount, accountId: extractAccountFromAddress(defaultAccountId), storedAs: defaultAccountId }
        : { account, accountId, storedAs: recipient }

    validRecipients.add(target.storedAs)
    // Bouncing SES-failed mail would be backscatter to a forged sender (AC-042)
    if (!sesFail && shouldBounceSender(envelopeSender, target.account.bounceSenders)) {
      bouncedRecipients.add(recipient)
    } else {
      const { isSpam, ruleIds, score } = classifyEmail(
        parsedMail,
        receipt,
        envelopeSender,
        recipientDomains,
        target.account.spamFilter ?? DEFAULT_SPAM_FILTER,
      )
      const filedAsSpam = sesFail || isSpam
      log('Classified email', { accountId: target.accountId, isSpam: filedAsSpam, messageId, ruleIds, score })
      if (filedAsSpam) {
        spamRecipients.add(target.storedAs)
      } else {
        notifyAccounts.add(target.accountId)
        target.account.forwardTargets?.forEach((forwardTarget) => forwardTargets.add(forwardTarget))
      }
    }
  }

  return {
    bouncedRecipients,
    forwardTargets,
    notifyAccounts,
    spamRecipients,
    validRecipients,
  }
}

export const processReceivedEmail = async (
  messageId: string,
  receipt: SESReceipt,
  envelopeSender: string,
): Promise<void> => {
  const sesFail = isSesFail(receipt)
  const parsedMail = await getParsedMail(messageId)
  const { forwardTargets, bouncedRecipients, notifyAccounts, spamRecipients, validRecipients } =
    await processRecipients(messageId, receipt, envelopeSender, parsedMail, sesFail)

  const attachments = await uploadAttachments(messageId, parsedMail.attachments)

  for (const recipient of validRecipients) {
    const accountId = extractAccountFromAddress(recipient)
    await registerReceivedEmail(recipient, messageId, parsedMail, spamRecipients.has(recipient) ? 'spam' : 'inbox')
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

  // Defense in depth for D-4: a spam recipient adds no forward targets, but SES-failed mail must never leave even if
  // that ever changes
  if (forwardTargets.size > 0 && !sesFail) {
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
    await registerReceivedEmail(address, messageId, parsedMail, 'inbox')
    await bounceReceivedEmail(address, messageId)
  }

  await deleteS3Object(`inbound/${messageId}`)
  for (const attachment of parsedMail.attachments) {
    await deleteS3Object(`inbound/${messageId}/${getAttachmentId(attachment)}`)
  }
}
