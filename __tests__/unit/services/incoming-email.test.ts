import { accounts, attachment, email, messageId, parsedContents } from '../__mocks__'
import * as emails from '@services/emails'
import { processReceivedEmail } from '@services/incoming-email'
import * as s3 from '@services/s3'
import * as attachments from '@utils/attachments'
import * as forwarding from '@utils/forwarding'
import * as parser from '@utils/parser'
import * as preferences from '@utils/preferences'

jest.mock('@services/emails')
jest.mock('@services/s3')
jest.mock('@utils/attachments')
jest.mock('@utils/forwarding')
jest.mock('@utils/logging')
jest.mock('@utils/parser')
jest.mock('@utils/preferences')

describe('incoming-email service', () => {
  describe('processReceivedEmail', () => {
    const recipients = ['e@mail.address', 'f@mail.address']

    beforeAll(() => {
      jest.mocked(attachments).getAttachmentId.mockImplementation((attachment) => attachment.contentId)
      jest.mocked(attachments).uploadAttachments.mockResolvedValue([attachment])
      jest.mocked(emails).extractAccountFromAddress.mockImplementation((email) => email[0])
      jest.mocked(emails).getAccountExists.mockResolvedValue(false)
      jest.mocked(parser).convertParsedContentsToEmail.mockReturnValue(email)
      jest.mocked(parser).getParsedMail.mockResolvedValue(parsedContents)
      jest.mocked(preferences).aggregatePreferences.mockResolvedValue(accounts.default)
    })

    it('should invoke registerReceivedEmail', async () => {
      await processReceivedEmail(messageId, recipients)

      expect(emails.registerReceivedEmail).toHaveBeenCalledWith(recipients[0], messageId, parsedContents)
      expect(emails.registerReceivedEmail).toHaveBeenCalledWith(recipients[1], messageId, parsedContents)
    })

    it('should invoke copyS3Object for the message', async () => {
      await processReceivedEmail(messageId, recipients)

      expect(s3.copyS3Object).toHaveBeenCalledWith(`inbound/${messageId}`, `received/e/${messageId}`)
      expect(s3.copyS3Object).toHaveBeenCalledWith(`inbound/${messageId}`, `received/f/${messageId}`)
      expect(s3.copyS3Object).toHaveBeenCalledWith(`inbound/${messageId}`, `received/admin/${messageId}`)
    })

    it('should invoke copyS3Object for attachments', async () => {
      await processReceivedEmail(messageId, recipients)

      expect(attachments.copyAttachmentsToAccount).toHaveBeenCalledWith('e', messageId, [attachment])
      expect(attachments.copyAttachmentsToAccount).toHaveBeenCalledWith('f', messageId, [attachment])
      expect(attachments.copyAttachmentsToAccount).toHaveBeenCalledWith('admin', messageId, [attachment])
    })

    it('should not invoke copyS3Object for admin when accounts exist', async () => {
      jest.mocked(emails).getAccountExists.mockResolvedValueOnce(true)
      jest.mocked(emails).getAccountExists.mockResolvedValueOnce(true)
      await processReceivedEmail(messageId, recipients)

      expect(s3.copyS3Object).toHaveBeenCalledWith(`inbound/${messageId}`, `received/e/${messageId}`)
      expect(s3.copyS3Object).toHaveBeenCalledWith(`inbound/${messageId}`, `received/f/${messageId}`)
      expect(s3.copyS3Object).not.toHaveBeenCalledWith(`inbound/${messageId}`, `received/admin/${messageId}`)
    })

    it('should not invoke copyS3Object for admin attachments when accounts exist', async () => {
      jest.mocked(emails).getAccountExists.mockResolvedValueOnce(true)
      jest.mocked(emails).getAccountExists.mockResolvedValueOnce(true)
      await processReceivedEmail(messageId, recipients)

      expect(attachments.copyAttachmentsToAccount).toHaveBeenCalledWith('e', messageId, [attachment])
      expect(attachments.copyAttachmentsToAccount).toHaveBeenCalledWith('f', messageId, [attachment])
      expect(attachments.copyAttachmentsToAccount).not.toHaveBeenCalledWith('admin', messageId, [attachment])
    })

    it('should invoke deleteS3Object for the message', async () => {
      await processReceivedEmail(messageId, recipients)

      expect(s3.deleteS3Object).toHaveBeenCalledWith(`inbound/${messageId}`)
    })

    it('should invoke deleteS3Object for attachments', async () => {
      await processReceivedEmail(messageId, recipients)

      expect(s3.deleteS3Object).toHaveBeenCalledWith(`inbound/${messageId}/${attachment.contentId}`)
    })

    it('should upload attachments', async () => {
      await processReceivedEmail(messageId, recipients)

      expect(attachments.uploadAttachments).toHaveBeenCalledWith(messageId, [attachment])
    })

    it('should pass getParsedMail contents to convertParsedContentsToEmail', async () => {
      await processReceivedEmail(messageId, recipients)

      expect(parser.convertParsedContentsToEmail).toHaveBeenCalledWith(messageId, parsedContents, recipients)
    })

    it('should call forwardEmail with forward targets', async () => {
      jest.mocked(preferences).aggregatePreferences.mockResolvedValue({ forwardTargets: recipients })
      await processReceivedEmail(messageId, recipients)

      expect(forwarding.forwardEmail).toHaveBeenCalledWith(recipients, email, [attachment])
    })

    it('should not call forwardEmail when no forward targets exist', async () => {
      jest.mocked(preferences).aggregatePreferences.mockResolvedValue({ forwardTargets: undefined })
      await processReceivedEmail(messageId, recipients)

      expect(forwarding.forwardEmail).toHaveBeenCalledTimes(0)
    })
  })
})
