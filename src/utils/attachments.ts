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

export const uploadAttachments = (messageId: string, emailAttachments: AttachmentCommon[]): Promise<unknown[]> =>
  Promise.all(
    emailAttachments.map((attachment) =>
      Promise.resolve(`inbound/${messageId}/${getAttachmentId(attachment)}`).then((s3Key) =>
        putS3Object(s3Key, attachment.content, getAttachmentMetadata(attachment)).then(() => ({
          ...attachment,
          content: s3Key,
        }))
      )
    )
  )
