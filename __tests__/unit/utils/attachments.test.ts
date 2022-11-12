import { mocked } from 'jest-mock'

import * as s3 from '@services/s3'
import { attachment, messageId, parsedContents } from '../__mocks__'
import { copyAttachmentsToAccount, getAttachmentId, uploadAttachments } from '@utils/attachments'

jest.mock('@services/s3')

describe('attachments', () => {
  describe('getAttachmentId', () => {
    test('expect cid when present', () => {
      const result = getAttachmentId(attachment)
      expect(result).toEqual('ytghji87ytgbhj')
    })

    test('expect checksum when present', () => {
      const result = getAttachmentId({ ...attachment, cid: undefined })
      expect(result).toEqual('jytgbni87ytgbnjkuy')
    })
  })

  describe('copyAttachmentsToAccount', () => {
    const accountId = 'account-id'

    test('expect copyS3Object called with attachment', async () => {
      await copyAttachmentsToAccount(accountId, messageId, parsedContents.attachments)
      expect(mocked(s3).copyS3Object).toHaveBeenCalledWith(
        'inbound/aaaaa-uuuuu-uuuuu-iiiii-ddddd/ytghji87ytgbhj',
        'received/account-id/aaaaa-uuuuu-uuuuu-iiiii-ddddd/ytghji87ytgbhj'
      )
    })
  })

  describe('uploadAttachments', () => {
    beforeAll(() => {
      mocked(s3).putS3Object.mockResolvedValue({})
    })

    test('expect putS3Object called with attachment', async () => {
      await uploadAttachments(messageId, [attachment])
      expect(mocked(s3).putS3Object).toHaveBeenCalledWith(
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
        }
      )
    })

    test('expect contentDisposition defaults to application/octet-stream', async () => {
      await uploadAttachments(messageId, [{ ...attachment, contentDisposition: undefined }])
      expect(mocked(s3).putS3Object).toHaveBeenCalledWith(
        'inbound/aaaaa-uuuuu-uuuuu-iiiii-ddddd/ytghji87ytgbhj',
        'A big file',
        expect.objectContaining({ contentDisposition: 'application/octet-stream' })
      )
    })

    test('expect putS3Object called with checksum when cid not available', async () => {
      await uploadAttachments(messageId, [{ ...attachment, cid: undefined, filename: undefined }])
      expect(mocked(s3).putS3Object).toHaveBeenCalledWith(
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
        }
      )
    })
  })
})
