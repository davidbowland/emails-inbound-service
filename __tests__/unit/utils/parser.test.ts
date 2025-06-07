import * as mailparser from 'mailparser'

import { attachment, email, messageId, parsedContents } from '../__mocks__'
import * as s3 from '@services/s3'
import { ParsedMail } from '@types'
import * as utilsAttachments from '@utils/attachments'
import { convertParsedContentsToEmail, getParsedMail } from '@utils/parser'

jest.mock('mailparser')
jest.mock('@services/s3')
jest.mock('@utils/attachments')

describe('parser', () => {
  describe('convertParsedContentsToEmail', () => {
    const recipients = ['e@mail.address']

    beforeAll(() => {
      jest.mocked(utilsAttachments).getAttachmentId.mockReturnValue(attachment.cid)
    })

    it('should convert contents correctly', async () => {
      const result = await convertParsedContentsToEmail(messageId, parsedContents, recipients)

      expect(result).toEqual(email)
    })

    it('should use default values when fields are missing', async () => {
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
      jest.mocked(s3).getS3Object.mockResolvedValue(contents)
      jest.mocked(mailparser).simpleParser.mockResolvedValue(parsedContents)
    })

    it('should query S3 object', async () => {
      await getParsedMail(messageId)

      expect(s3.getS3Object).toHaveBeenCalledWith('inbound/aaaaa-uuuuu-uuuuu-iiiii-ddddd')
    })

    it('should pass S3 object contents to simpleParser', async () => {
      await getParsedMail(messageId)

      expect(mailparser.simpleParser).toHaveBeenCalledWith(contents)
    })

    it('should return simpleParser result', async () => {
      const result = await getParsedMail(messageId)

      expect(result).toEqual(parsedContents)
    })
  })
})
