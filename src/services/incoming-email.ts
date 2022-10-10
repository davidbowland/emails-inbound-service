import { AccountInboundPreference, AttachmentCommon, AxiosResponse, Email } from '../types'
import { convertParsedContentsToEmail, getParsedMail } from '../utils/parser'
import { aggregatePreferences } from '../utils/preferences'
import { forwardEmail } from '../utils/forwarding'
import { log } from '../utils/logging'
import { uploadAttachments } from '../utils/attachments'

const applyPreferencesToEmail = async (
  preferences: AccountInboundPreference,
  email: Email,
  attachments: AttachmentCommon[]
): Promise<AxiosResponse[] | undefined> => {
  if (preferences.forwardTargets) {
    return await forwardEmail([...preferences.forwardTargets], email, attachments)
  }
  return undefined
}

export const processReceivedEmail = async (
  messageId: string,
  recipients: string[]
): Promise<AxiosResponse[] | undefined> => {
  const parsedMail = await getParsedMail(messageId)
  const preferences = await aggregatePreferences(recipients)
  log(`${messageId} to ${recipients} =>`, preferences)

  const attachments = await uploadAttachments(messageId, parsedMail.attachments)
  return await applyPreferencesToEmail(
    preferences,
    convertParsedContentsToEmail(messageId, parsedMail, recipients),
    attachments
  )
}
