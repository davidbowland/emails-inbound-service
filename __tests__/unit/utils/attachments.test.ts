import { attachment, messageId, parsedContents } from '../__mocks__'
import * as s3 from '@services/s3'
import { copyAttachmentsToAccount, getAttachmentId, uploadAttachments } from '@utils/attachments'

jest.mock('@services/s3')
jest.mock('@utils/logging')

describe('attachments', () => {
  describe('getAttachmentId', () => {
    it('should return cid when present', () => {
      const result = getAttachmentId(attachment)

      expect(result).toEqual('ytghji87ytgbhj')
    })

    it('should return checksum when present', () => {
      const result = getAttachmentId({ ...attachment, cid: undefined })

      expect(result).toEqual('jytgbni87ytgbnjkuy')
    })
  })

  describe('copyAttachmentsToAccount', () => {
    const accountId = 'account-id'

    it('should call copyS3Object with attachment', async () => {
      await copyAttachmentsToAccount(accountId, messageId, parsedContents.attachments)

      expect(s3.copyS3Object).toHaveBeenCalledWith(
        'inbound/aaaaa-uuuuu-uuuuu-iiiii-ddddd/ytghji87ytgbhj',
        'received/account-id/aaaaa-uuuuu-uuuuu-iiiii-ddddd/ytghji87ytgbhj',
      )
    })
  })

  describe('uploadAttachments', () => {
    beforeAll(() => {
      jest.mocked(s3).putS3Object.mockResolvedValue({})
    })

    it('should call putS3Object with attachment', async () => {
      await uploadAttachments(messageId, [attachment])

      expect(s3.putS3Object).toHaveBeenCalledWith(
        'inbound/aaaaa-uuuuu-uuuuu-iiiii-ddddd/ytghji87ytgbhj',
        'A big file',
        {
          checksum: 'jytgbni87ytgbnjkuy',
          contentDisposition: 'attachment',
          contentType: 'text/plain',
          filename: 'big.file',
          headers: JSON.stringify({ author: 'Shakespeare' }),
          related: 'false',
          size: '32000',
        },
      )
    })

    it('should default contentDisposition to application/octet-stream', async () => {
      await uploadAttachments(messageId, [{ ...attachment, contentDisposition: undefined }])

      expect(s3.putS3Object).toHaveBeenCalledWith(
        'inbound/aaaaa-uuuuu-uuuuu-iiiii-ddddd/ytghji87ytgbhj',
        'A big file',
        expect.objectContaining({ contentDisposition: 'application/octet-stream' }),
      )
    })

    it('should call putS3Object with checksum when cid not available', async () => {
      await uploadAttachments(messageId, [{ ...attachment, cid: undefined, filename: undefined }])

      expect(s3.putS3Object).toHaveBeenCalledWith(
        'inbound/aaaaa-uuuuu-uuuuu-iiiii-ddddd/jytgbni87ytgbnjkuy',
        'A big file',
        {
          checksum: 'jytgbni87ytgbnjkuy',
          contentDisposition: 'attachment',
          contentType: 'text/plain',
          filename: 'unnamed',
          headers: JSON.stringify({ author: 'Shakespeare' }),
          related: 'false',
          size: '32000',
        },
      )
    })
  })
})
