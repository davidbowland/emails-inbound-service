import { putS3Object } from '../services/s3'
import { AttachmentCommon, StringObject } from '../types'

const getAttachmentMetadata = (attachment: AttachmentCommon): StringObject => ({
  checksum: attachment.checksum,
  contentDisposition: attachment.contentDisposition,
  contentType: attachment.contentType,
  filename: attachment.filename ?? 'unnamed',
  headers: JSON.stringify(attachment.headers),
  related: `${attachment.related}`,
  size: `${attachment.size}`,
})

export const getAttachmentId = (attachment: AttachmentCommon): string => attachment.cid ?? attachment.checksum

export const uploadAttachments = (
  messageId: string,
  emailAttachments: AttachmentCommon[]
): Promise<AttachmentCommon[]> =>
  Promise.all(
    emailAttachments.map(async (attachment) => {
      const s3Key = `inbound/${messageId}/${getAttachmentId(attachment)}`
      await putS3Object(s3Key, attachment.content, getAttachmentMetadata(attachment))
      return {
        ...attachment,
        content: s3Key,
      }
    })
  )
