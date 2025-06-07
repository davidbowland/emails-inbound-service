import { copyS3Object, putS3Object } from '../services/s3'
import { AttachmentCommon, StringObject } from '../types'

/* Parsing */

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

/* S3 */

export const copyAttachmentsToAccount = async (
  accountId: string,
  messageId: string,
  emailAttachments: AttachmentCommon[],
): Promise<void> => {
  for (const attachment of emailAttachments) {
    await copyS3Object(
      `inbound/${messageId}/${getAttachmentId(attachment)}`,
      `received/${accountId}/${messageId}/${getAttachmentId(attachment)}`,
    )
  }
}

export const uploadAttachments = async (
  messageId: string,
  emailAttachments: AttachmentCommon[],
): Promise<AttachmentCommon[]> => {
  const uploadedAttachments = emailAttachments.map(async (attachment) => {
    const s3Key = `inbound/${messageId}/${getAttachmentId(attachment)}`
    await putS3Object(s3Key, attachment.content, getAttachmentMetadata(attachment))
    return {
      ...attachment,
      content: s3Key,
    }
  })
  return Promise.all(uploadedAttachments)
}
