import { v1 as uuidv1 } from 'uuid'

import { AttachmentCommon, Email } from '../types'
import { copyS3Object } from '../services/s3'
import { getAttachmentId } from './attachments'
import { sendEmail } from '../services/queue'

export const forwardEmail = async (targets: string[], email: Email, attachments: AttachmentCommon[]): Promise<void> => {
  for (const target of targets) {
    const uuid = uuidv1()
    const attachmentsOnS3 = attachments.map(async (attachment) => {
      const s3Key = `queue/${uuid}/${getAttachmentId(attachment)}`
      await copyS3Object(attachment.content, s3Key)
      return { ...attachment, content: s3Key }
    })
    await sendEmail(target, email, await Promise.all(attachmentsOnS3))
  }
}
