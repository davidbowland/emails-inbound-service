import { AttachmentCommon, StringObject } from '../types'
import { putS3Object } from '../services/s3'

const getAttachmentMetadata = (attachment: AttachmentCommon): StringObject => ({
  checksum: attachment.checksum,
  contentDisposition: attachment.contentDisposition ?? 'application/octet-stream',
  contentType: attachment.contentType,
  filename: attachment.filename ?? 'unnamed',
  headers: JSON.stringify(attachment.headers),
  related: `${attachment.related}`,
  size: `${attachment.size}`,
})

export const getAttachmentId = (attachment: AttachmentCommon): string => attachment.cid ?? attachment.checksum

export const uploadAttachments = async (
  messageId: string,
  emailAttachments: AttachmentCommon[]
): Promise<AttachmentCommon[]> => {
  const uploadedAttachmenets = emailAttachments.map(async (attachment) => {
    const s3Key = `inbound/${messageId}/${getAttachmentId(attachment)}`
    await putS3Object(s3Key, attachment.content, getAttachmentMetadata(attachment))
    return {
      ...attachment,
      content: s3Key,
    }
  })
  return Promise.all(uploadedAttachmenets)
}
