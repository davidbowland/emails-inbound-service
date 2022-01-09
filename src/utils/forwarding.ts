import { v1 as uuidv1 } from 'uuid'

import { getAttachmentId } from './attachments'
import { copyS3Object } from '../services/s3'
import { sendEmail } from '../services/queue'
import { AttachmentCommon, AxiosResponse, Email } from '../types'

const copyAttachments = (attachments: AttachmentCommon[], uuid: string): Promise<AttachmentCommon[]> =>
  Promise.all(
    attachments.map((attachment) =>
      copyS3Object(attachment.content, `queue/emails-service/${uuid}/${getAttachmentId(attachment)}`).then(() => ({
        ...attachment,
        content: `queue/emails-service/${uuid}/${getAttachmentId(attachment)}`,
      }))
    )
  )

export const forwardEmail = (
  targets: string[],
  email: Email,
  attachments: AttachmentCommon[]
): Promise<AxiosResponse[]> =>
  Promise.all(
    targets.map((target) =>
      copyAttachments(attachments, uuidv1()).then((attachmentsOnS3) => sendEmail(target, email, attachmentsOnS3))
    )
  )
