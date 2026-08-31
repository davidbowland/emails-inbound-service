import { attachment, email, messageId, parsedContents } from '../__mocks__'
import * as emails from '@services/emails'
import { processReceivedEmail } from '@services/incoming-email'
import * as s3 from '@services/s3'
import * as attachments from '@utils/attachments'
import * as bounce from '@utils/bounce'
import * as forwarding from '@utils/forwarding'
import * as logging from '@utils/logging'
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
      // Mirrors the real implementation, which lowercases (src/services/emails.ts)
      jest.mocked(emails).extractAccountFromAddress.mockImplementation((email) => email.split('@')[0].toLowerCase())
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

      expect(forwarding.forwardEmail).toHaveBeenCalledWith(['forward2@example.com'], expect.any(Object), [attachment])
      expect(parser.convertParsedContentsToEmail).toHaveBeenCalledWith(messageId, parsedContents, [
        'e@mail.address',
        'f@mail.address',
      ])
    })

    it('should notify every valid recipient account', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(emails.notifyReceivedEmail).toHaveBeenCalledWith('e', messageId)
      expect(emails.notifyReceivedEmail).toHaveBeenCalledWith('f', messageId)
    })

    it('should not notify bounced recipients', async () => {
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

      expect(emails.notifyReceivedEmail).toHaveBeenCalledTimes(1)
      expect(emails.notifyReceivedEmail).toHaveBeenCalledWith('f', messageId)
    })

    it('should notify the default account when the recipient account does not exist', async () => {
      jest
        .mocked(emails)
        .getAccount.mockResolvedValueOnce({ bounceSenders: [] }) // admin account
        .mockRejectedValueOnce(new Error('Account not found')) // first recipient
        .mockRejectedValueOnce(new Error('Account not found')) // second recipient

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(emails.notifyReceivedEmail).toHaveBeenCalledTimes(1)
      expect(emails.notifyReceivedEmail).toHaveBeenCalledWith('admin', messageId)
    })

    it('should notify once when a resolvable recipient and an unresolvable one both land on the default account', async () => {
      jest
        .mocked(emails)
        .getAccount.mockResolvedValueOnce({ bounceSenders: [] }) // admin account
        .mockResolvedValueOnce({ bounceSenders: [] }) // admin@dbowland.com resolves
        .mockRejectedValueOnce(new Error('Account not found')) // ghost@dbowland.com falls back to admin

      await processReceivedEmail(messageId, ['admin@dbowland.com', 'ghost@dbowland.com'], senderEmail)

      expect(emails.notifyReceivedEmail).toHaveBeenCalledTimes(1)
      expect(emails.notifyReceivedEmail).toHaveBeenCalledWith('admin', messageId)
    })

    it('should notify once when the default account id is an address', async () => {
      // config reads DEFAULT_ACCOUNT_ID once at import time, so changing it means reloading the module graph.
      // The restore sits in a finally because a failed expectation would otherwise leave the wrong value behind.
      try {
        process.env.DEFAULT_ACCOUNT_ID = 'admin@dbowland.com'

        await jest.isolateModulesAsync(async () => {
          const isolatedAttachments = await import('@utils/attachments')
          const isolatedBounce = await import('@utils/bounce')
          const isolatedEmails = await import('@services/emails')
          const isolatedParser = await import('@utils/parser')
          const { processReceivedEmail: isolatedProcess } = await import('@services/incoming-email')
          jest.mocked(isolatedAttachments).getAttachmentId.mockImplementation((attachment) => attachment.contentId)
          jest.mocked(isolatedAttachments).uploadAttachments.mockResolvedValue([attachment])
          jest.mocked(isolatedBounce).shouldBounceSender.mockReturnValue(false)
          jest
            .mocked(isolatedEmails)
            .extractAccountFromAddress.mockImplementation((email) => email.split('@')[0].toLowerCase())
          jest
            .mocked(isolatedEmails)
            .getAccount.mockResolvedValueOnce({ bounceSenders: [] }) // default account
            .mockResolvedValueOnce({ bounceSenders: [] }) // admin@dbowland.com resolves
            .mockRejectedValueOnce(new Error('Account not found')) // ghost@dbowland.com falls back to the default
          jest.mocked(isolatedParser).getParsedMail.mockResolvedValue(parsedContents)

          await isolatedProcess(messageId, ['admin@dbowland.com', 'ghost@dbowland.com'], senderEmail)

          expect(isolatedEmails.notifyReceivedEmail).toHaveBeenCalledTimes(1)
          expect(isolatedEmails.notifyReceivedEmail).toHaveBeenCalledWith('admin', messageId)
        })
      } finally {
        process.env.DEFAULT_ACCOUNT_ID = 'admin'
      }
    })

    it('should notify once when the same account is addressed on two domains', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })

      await processReceivedEmail(messageId, ['e@dbowland.com', 'e@bowland.link'], senderEmail)

      expect(emails.notifyReceivedEmail).toHaveBeenCalledTimes(1)
      expect(emails.notifyReceivedEmail).toHaveBeenCalledWith('e', messageId)
    })

    it('should notify once when the same account is addressed in two letter cases', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })

      await processReceivedEmail(messageId, ['E@dbowland.com', 'e@dbowland.com'], senderEmail)

      expect(emails.notifyReceivedEmail).toHaveBeenCalledTimes(1)
      expect(emails.notifyReceivedEmail).toHaveBeenCalledWith('e', messageId)
    })

    it('should notify only after every valid recipient has been registered and copied', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })

      await processReceivedEmail(messageId, recipients, senderEmail)

      const lastRegister = Math.max(...jest.mocked(emails.registerReceivedEmail).mock.invocationCallOrder)
      const lastCopy = Math.max(...jest.mocked(s3.copyS3Object).mock.invocationCallOrder)
      const firstNotify = Math.min(...jest.mocked(emails.notifyReceivedEmail).mock.invocationCallOrder)
      expect(firstNotify).toBeGreaterThan(lastRegister)
      expect(firstNotify).toBeGreaterThan(lastCopy)
    })

    it('should bounce rather than notify when an unresolvable recipient is from a bounced sender', async () => {
      jest
        .mocked(emails)
        .getAccount.mockResolvedValueOnce({ bounceSenders: ['sender@example.com'] }) // admin account
        .mockRejectedValueOnce(new Error('Account not found')) // recipient falls back to admin
      jest.mocked(bounce).shouldBounceSender.mockReturnValueOnce(true)

      await processReceivedEmail(messageId, ['ghost@mail.address'], senderEmail)

      expect(emails.notifyReceivedEmail).not.toHaveBeenCalled()
      expect(emails.bounceReceivedEmail).toHaveBeenCalledWith('ghost@mail.address', messageId)
    })

    it('should log a warning and continue when notification fails', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })
      jest.mocked(emails).notifyReceivedEmail.mockRejectedValueOnce(new Error('Internal server error'))

      await expect(processReceivedEmail(messageId, recipients, senderEmail)).resolves.toBeUndefined()

      expect(logging.logWarn).toHaveBeenCalledWith('Unable to notify account of received email', {
        accountId: 'e',
        messageId,
      })
      expect(emails.notifyReceivedEmail).toHaveBeenCalledWith('f', messageId)
      expect(s3.deleteS3Object).toHaveBeenCalledWith(`inbound/${messageId}`)
    })

    it('should log the response status when the notify endpoint rejects', async () => {
      jest.mocked(emails).getAccount.mockResolvedValue({ bounceSenders: [] })
      jest.mocked(emails).notifyReceivedEmail.mockRejectedValueOnce({
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: { status: 403 },
      })

      await processReceivedEmail(messageId, recipients, senderEmail)

      expect(logging.logWarn).toHaveBeenCalledWith('Unable to notify account of received email', {
        accountId: 'e',
        messageId,
        status: 403,
      })
    })
  })
})
