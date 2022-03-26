import { AccountInboundPreference, AttachmentCommon, AxiosResponse, Email } from '../types'
import { convertParsedContentsToEmail, getParsedMail } from '../utils/parser'
import { aggregatePreferences } from '../utils/preferences'
import { forwardEmail } from '../utils/forwarding'
import { log } from '../utils/logging'
import { uploadAttachments } from '../utils/attachments'

const applyPreferencesToEmail = (
  preferences: AccountInboundPreference,
  email: Email,
  attachments: AttachmentCommon[]
): Promise<AxiosResponse[]> =>
  preferences.forwardTargets
    ? forwardEmail([...preferences.forwardTargets], email, attachments)
    : Promise.resolve(undefined)

export const processReceivedEmail = async (messageId: string, recipients: string[]): Promise<AxiosResponse[]> => {
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
