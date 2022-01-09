import { saveEmail } from '../services/emails'
import { AccountInboundPreference, AttachmentCommon, AxiosResponse, Email } from '../types'
import { uploadAttachments } from '../utils/attachments'
import { forwardEmail } from '../utils/forwarding'
import { log } from '../utils/logging'
import { convertParsedContentsToEmail, getParsedMail } from '../utils/parser'
import { aggregatePreferences } from '../utils/preferences'

const applyPreferencesToEmail = (
  preferences: AccountInboundPreference,
  email: Email,
  attachments: AttachmentCommon[]
) =>
  Promise.resolve(preferences.save ? saveEmail(email) : undefined).then(() =>
    preferences.forwardTargets ? forwardEmail([...preferences.forwardTargets], email, attachments) : undefined
  )

export const processReceivedEmail = (messageId: string, recipients: string[]): Promise<AxiosResponse[]> =>
  getParsedMail(messageId).then((parsedMail) =>
    aggregatePreferences(recipients).then(
      (preferences) => (
        log(`${messageId} to ${recipients} =>`, preferences),
        uploadAttachments(messageId, parsedMail.attachments).then((attachments: AttachmentCommon[]) =>
          applyPreferencesToEmail(
            preferences,
            convertParsedContentsToEmail(messageId, parsedMail, recipients),
            attachments
          )
        )
      )
    )
  )
