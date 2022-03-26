import { v1 as uuidv1 } from 'uuid'

import { AttachmentCommon, AxiosResponse, Email } from '../types'
import { copyS3Object } from '../services/s3'
import { getAttachmentId } from './attachments'
import { sendEmail } from '../services/queue'

const copyAttachments = (attachments: AttachmentCommon[], uuid: string): Promise<AttachmentCommon[]> =>
  Promise.all(
    attachments.map(async (attachment) => {
      await copyS3Object(attachment.content, `queue/emails-service/${uuid}/${getAttachmentId(attachment)}`)
      return {
        ...attachment,
        content: `queue/emails-service/${uuid}/${getAttachmentId(attachment)}`,
      }
    })
  )

export const forwardEmail = (
  targets: string[],
  email: Email,
  attachments: AttachmentCommon[]
): Promise<AxiosResponse[]> =>
  Promise.all(
    targets.map(async (target) => {
      const attachmentsOnS3 = await copyAttachments(attachments, uuidv1())
      return sendEmail(target, email, attachmentsOnS3)
    })
  )
