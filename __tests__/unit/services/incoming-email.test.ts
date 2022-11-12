import { mocked } from 'jest-mock'

import * as attachments from '@utils/attachments'
import * as emails from '@services/emails'
import * as forwarding from '@utils/forwarding'
import * as parser from '@utils/parser'
import * as preferences from '@utils/preferences'
import * as s3 from '@services/s3'
import { accounts, attachment, email, messageId, parsedContents } from '../__mocks__'
import { processReceivedEmail } from '@services/incoming-email'

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
      mocked(attachments).getAttachmentId.mockImplementation((attachment) => attachment.contentId)
      mocked(attachments).uploadAttachments.mockResolvedValue([attachment])
      mocked(emails).extractAccountFromAddress.mockImplementation((email) => email[0])
      mocked(parser).convertParsedContentsToEmail.mockReturnValue(email)
      mocked(parser).getParsedMail.mockResolvedValue(parsedContents)
      mocked(preferences).aggregatePreferences.mockResolvedValue(accounts.default)
    })

    test('expect registerReceivedEmail invoked', async () => {
      await processReceivedEmail(messageId, recipients)
      expect(mocked(emails).registerReceivedEmail).toHaveBeenCalledWith(recipients[0], messageId, parsedContents)
      expect(mocked(emails).registerReceivedEmail).toHaveBeenCalledWith(recipients[1], messageId, parsedContents)
    })

    test('expect copyS3Object invoked for the message', async () => {
      await processReceivedEmail(messageId, recipients)
      expect(mocked(s3).copyS3Object).toHaveBeenCalledWith(`inbound/${messageId}`, `received/e/${messageId}`)
      expect(mocked(s3).copyS3Object).toHaveBeenCalledWith(`inbound/${messageId}`, `received/f/${messageId}`)
    })

    test('expect copyS3Object invoked for attachments', async () => {
      await processReceivedEmail(messageId, recipients)
      expect(mocked(attachments).copyAttachmentsToAccount).toHaveBeenCalledWith('e', messageId, [attachment])
      expect(mocked(attachments).copyAttachmentsToAccount).toHaveBeenCalledWith('f', messageId, [attachment])
    })

    test('expect deleteS3Object invoked for the message', async () => {
      await processReceivedEmail(messageId, recipients)
      expect(mocked(s3).deleteS3Object).toHaveBeenCalledWith(`inbound/${messageId}`)
    })

    test('expect deleteS3Object invoked for attachments', async () => {
      await processReceivedEmail(messageId, recipients)
      expect(mocked(s3).deleteS3Object).toHaveBeenCalledWith(`inbound/${messageId}/${attachment.contentId}`)
    })

    test('expect attachments uploaded', async () => {
      await processReceivedEmail(messageId, recipients)
      expect(mocked(attachments).uploadAttachments).toHaveBeenCalledWith(messageId, [attachment])
    })

    test('expect getParsedMail contents passed to convertParsedContentsToEmail', async () => {
      await processReceivedEmail(messageId, recipients)
      expect(mocked(parser).convertParsedContentsToEmail).toHaveBeenCalledWith(messageId, parsedContents, recipients)
    })

    test('expect forwardEmail called with forward targets', async () => {
      mocked(preferences).aggregatePreferences.mockResolvedValue({ forwardTargets: recipients })
      await processReceivedEmail(messageId, recipients)
      expect(mocked(forwarding).forwardEmail).toHaveBeenCalledWith(recipients, email, [attachment])
    })

    test('expect forwardEmail to not be called with no forward targets', async () => {
      mocked(preferences).aggregatePreferences.mockResolvedValue({ forwardTargets: undefined })
      await processReceivedEmail(messageId, recipients)
      expect(mocked(forwarding).forwardEmail).toHaveBeenCalledTimes(0)
    })
  })
})
