import * as mailparser from 'mailparser'
import { mocked } from 'jest-mock'

import * as s3 from '@services/s3'
import * as utilsAttachments from '@utils/attachments'
import { attachment, email, messageId, parsedContents } from '../__mocks__'
import { convertParsedContentsToEmail, getParsedMail } from '@utils/parser'
import { ParsedMail } from '@types'

jest.mock('mailparser')
jest.mock('@services/s3')
jest.mock('@utils/attachments')

describe('parser', () => {
  describe('convertParsedContentsToEmail', () => {
    const recipients = ['e@mail.address']

    beforeAll(() => {
      mocked(utilsAttachments).getAttachmentId.mockReturnValue(attachment.cid)
    })

    test('expect contents converted correctly', async () => {
      const result = await convertParsedContentsToEmail(messageId, parsedContents, recipients)

      expect(result).toEqual(email)
    })

    test('expect default values', async () => {
      const reference = 'fnord'
      const tempContents = {
        ...parsedContents,
        from: undefined,
        html: undefined,
        messageId: undefined,
        references: reference,
        text: undefined,
        textAsHtml: false,
      } as unknown as ParsedMail
      const result = await convertParsedContentsToEmail(messageId, tempContents, recipients)

      expect(result.bodyHtml).toEqual('')
      expect(result.bodyText).toEqual('')
      expect(result.fromAddress).toEqual({ html: '', text: '', value: [{ address: '', name: '' }] })
      expect(result.id).toEqual(messageId)
      expect(result.references).toEqual([reference])
    })
  })

  describe('getParsedMail', () => {
    const contents = 'some cool contents'

    beforeAll(() => {
      mocked(s3).getS3Object.mockResolvedValue(contents)
      mocked(mailparser).simpleParser.mockResolvedValue(parsedContents)
    })

    test('expect S3 object queried', async () => {
      await getParsedMail(messageId)

      expect(mocked(s3).getS3Object).toHaveBeenCalledWith('inbound/aaaaa-uuuuu-uuuuu-iiiii-ddddd')
    })

    test('expect S3 object contents passed to simpleParser', async () => {
      await getParsedMail(messageId)

      expect(mocked(mailparser).simpleParser).toHaveBeenCalledWith(contents)
    })

    test('expect simpleParser result returned', async () => {
      const result = await getParsedMail(messageId)

      expect(result).toEqual(parsedContents)
    })
  })
})
