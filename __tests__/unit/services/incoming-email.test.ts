import { attachment, email, messageId, parsedContents } from '../__mocks__'
import * as emails from '@services/emails'
import { processReceivedEmail } from '@services/incoming-email'
import * as s3 from '@services/s3'
import * as attachments from '@utils/attachments'
import * as bounce from '@utils/bounce'
import * as forwarding from '@utils/forwarding'
import * as parser from '@utils/parser'

jest.mock('@services/emails')
jest.mock('@services/s3')
jest.mock('@utils/attachments')
jest.mock('@utils/bounce')
jest.mock('@utils/forwarding')
jest.mock('@utils/logging')
jest.mock('@utils/parser')

describe('incoming-email service', () => {
  describe('processReceivedEmail', () => {
    const recipients = ['e@mail.address', 'f@mail.address']
    const senderEmail = 'sender@example.com'

    beforeAll(() => {
      jest.mocked(attachments).getAttachmentId.mockImplementation((attachment) => attachment.contentId)
      jest.mocked(attachments).uploadAttachments.mockResolvedValue([attachment])
      jest.mocked(bounce).shouldBounceSender.mockReturnValue(false)
      jest.mocked(emails).extractAccountFromAddress.mockImplementation((email) => email.split('@')[0])
      jest.mocked(parser).convertParsedContentsToEmail.mockReturnValue(email)
      jest.mocked(parser).getParsedMail.mockResolvedValue(parsedContents)
    })

    it('should register received email for valid recipients', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(emails.registerReceivedEmail).toHaveBeenCalledWith(recipients[0], messageId, parsedContents)
      expect(emails.registerReceivedEmail).toHaveBeenCalledWith(recipients[1], messageId, parsedContents)
    })

    it('should copy S3 objects for valid recipients', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(s3.copyS3Object).toHaveBeenCalledWith(`inbound/${messageId}`, `received/e/${messageId}`)
      expect(s3.copyS3Object).toHaveBeenCalledWith(`inbound/${messageId}`, `received/f/${messageId}`)
    })

    it('should copy attachments to account folders', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(attachments.copyAttachmentsToAccount).toHaveBeenCalledWith('e', messageId, [attachment])
      expect(attachments.copyAttachmentsToAccount).toHaveBeenCalledWith('f', messageId, [attachment])
    })

    it('should use admin account when recipient account does not exist', async () => {
      jest
        .mocked(emails)
        .getAccount.mockResolvedValueOnce({ bounceSenders: [], forwardTargets: ['admin@example.com'] }) // admin account for processRecipients
        .mockRejectedValueOnce(new Error('Account not found')) // first recipient in processRecipients
        .mockRejectedValueOnce(new Error('Account not found')) // second recipient in processRecipients

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(s3.copyS3Object).toHaveBeenCalledWith(`inbound/${messageId}`, `received/admin/${messageId}`)
      expect(emails.registerReceivedEmail).toHaveBeenCalledWith('admin', messageId, parsedContents)
      expect(attachments.copyAttachmentsToAccount).toHaveBeenCalledWith('admin', messageId, [attachment])
    })

    it('should delete inbound S3 objects after processing', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(s3.deleteS3Object).toHaveBeenCalledWith(`inbound/${messageId}`)
      expect(s3.deleteS3Object).toHaveBeenCalledWith(`inbound/${messageId}/${attachment.contentId}`)
    })

    it('should upload attachments', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(attachments.uploadAttachments).toHaveBeenCalledWith(messageId, [attachment])
    })

    it('should pass parsed mail contents to convertParsedContentsToEmail when forwarding', async () => {
      jest
        .mocked(emails)
        .getAccount.mockResolvedValueOnce({ bounceSenders: [] }) // admin account
        .mockResolvedValueOnce({ bounceSenders: [], forwardTargets: ['forward@example.com'] }) // first recipient
        .mockResolvedValueOnce({ bounceSenders: [] }) // second recipient

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(parser.convertParsedContentsToEmail).toHaveBeenCalledWith(messageId, parsedContents, recipients)
    })

    it('should forward email when forward targets exist', async () => {
      jest
        .mocked(emails)
        .getAccount.mockResolvedValueOnce({ bounceSenders: [] }) // admin account
        .mockResolvedValueOnce({ bounceSenders: [], forwardTargets: ['forward@example.com'] }) // first recipient
        .mockResolvedValueOnce({ bounceSenders: [] }) // second recipient

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(forwarding.forwardEmail).toHaveBeenCalledWith(['forward@example.com'], email, [attachment])
    })

    it('should not forward email when no forward targets exist', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(forwarding.forwardEmail).not.toHaveBeenCalled()
    })

    it('should bounce all recipients when all should be bounced', async () => {
      jest.mocked(bounce).shouldBounceSender.mockReturnValue(true)
      jest
        .mocked(emails)
        .getAccount.mockResolvedValueOnce({ bounceSenders: ['sender@example.com'] }) // admin account
        .mockResolvedValueOnce({ bounceSenders: ['sender@example.com'] }) // first recipient
        .mockResolvedValueOnce({ bounceSenders: ['sender@example.com'] }) // second recipient

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(emails.bounceReceivedEmail).toHaveBeenCalledWith('e@mail.address', messageId)
      expect(emails.bounceReceivedEmail).toHaveBeenCalledWith('f@mail.address', messageId)
      expect(s3.copyS3Object).not.toHaveBeenCalledWith(expect.stringContaining('received/'), expect.anything())
      expect(forwarding.forwardEmail).not.toHaveBeenCalled()
    })

    it('should bounce only specific recipients when some should be bounced', async () => {
      jest
        .mocked(emails)
        .getAccount.mockResolvedValueOnce({ bounceSenders: [] }) // admin account
        .mockResolvedValueOnce({ bounceSenders: ['sender@example.com'] }) // first recipient
        .mockResolvedValueOnce({ bounceSenders: [] }) // second recipient
      jest
        .mocked(bounce)
        .shouldBounceSender.mockReturnValueOnce(true) // first recipient should bounce
        .mockReturnValueOnce(false) // second recipient should not bounce

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(emails.bounceReceivedEmail).toHaveBeenCalledWith('e@mail.address', messageId)
      expect(emails.registerReceivedEmail).toHaveBeenCalledWith('f@mail.address', messageId, parsedContents)
      expect(s3.copyS3Object).toHaveBeenCalledWith(`inbound/${messageId}`, `received/f/${messageId}`)
    })

    it('should not forward emails for bounced recipients', async () => {
      jest
        .mocked(emails)
        .getAccount.mockResolvedValueOnce({ bounceSenders: [] }) // admin account for processRecipients
        .mockResolvedValueOnce({ bounceSenders: ['sender@example.com'], forwardTargets: ['forward@example.com'] }) // first recipient
        .mockResolvedValueOnce({ bounceSenders: [], forwardTargets: ['forward2@example.com'] }) // second recipient
      jest
        .mocked(bounce)
        .shouldBounceSender.mockReturnValueOnce(true) // first recipient should bounce
        .mockReturnValueOnce(false) // second recipient should not bounce

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(forwarding.forwardEmail).toHaveBeenCalledWith(
        ['forward@example.com', 'forward2@example.com'],
        expect.any(Object),
        [attachment],
      )
      expect(parser.convertParsedContentsToEmail).toHaveBeenCalledWith(messageId, parsedContents, [
        'e@mail.address',
        'f@mail.address',
      ])
    })
  })
})
