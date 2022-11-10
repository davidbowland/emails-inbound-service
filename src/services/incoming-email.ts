import { AccountPreference, AttachmentCommon, Email } from '../types'
import { convertParsedContentsToEmail, getParsedMail } from '../utils/parser'
import { aggregatePreferences } from '../utils/preferences'
import { forwardEmail } from '../utils/forwarding'
import { log } from '../utils/logging'
import { registerReceivedEmail } from './emails'
import { uploadAttachments } from '../utils/attachments'

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
    await registerReceivedEmail(messageId, address, parsedMail)
  }
}
