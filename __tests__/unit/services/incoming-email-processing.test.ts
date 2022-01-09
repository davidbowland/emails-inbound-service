import { accounts, attachment, email, messageId, parsedContents } from '../__mocks__'
import { mocked } from 'jest-mock'
import * as emails from '@services/emails'
import { processReceivedEmail } from '@services/incoming-email-processing'
import * as attachments from '@utils/attachments'
import * as forwarding from '@utils/forwarding'
import * as parser from '@utils/parser'
import * as preferences from '@utils/preferences'

jest.mock('@services/emails')
jest.mock('@utils/attachments')
jest.mock('@utils/forwarding')
jest.mock('@utils/logging')
jest.mock('@utils/parser')
jest.mock('@utils/preferences')

describe('email', () => {
  describe('processReceivedEmail', () => {
    const recipients = ['e@mail.address']

    beforeAll(() => {
      mocked(attachments).uploadAttachments.mockResolvedValue([attachment])
      mocked(forwarding).forwardEmail.mockResolvedValue([])
      mocked(parser).convertParsedContentsToEmail.mockReturnValue(email)
      mocked(parser).getParsedMail.mockResolvedValue(parsedContents)
      mocked(preferences).aggregatePreferences.mockResolvedValue(accounts.default.inbound)
    })

    test('expect attachments uploaded', async () => {
      await processReceivedEmail(messageId, recipients)
      expect(mocked(attachments).uploadAttachments).toHaveBeenCalledWith(messageId, [attachment])
    })

    test('expect getParsedMail contents passed to convertParsedContentsToEmail', async () => {
      await processReceivedEmail(messageId, recipients)
      expect(mocked(parser).convertParsedContentsToEmail).toHaveBeenCalledWith(messageId, parsedContents, recipients)
    })

    test('expect saveEmail called when save=true', async () => {
      mocked(preferences).aggregatePreferences.mockResolvedValue({ save: true })
      await processReceivedEmail(messageId, recipients)
      expect(mocked(emails).saveEmail).toHaveBeenCalledWith(email)
    })

    test('expect saveEmail to not be called when save=false', async () => {
      mocked(preferences).aggregatePreferences.mockResolvedValue({ save: false })
      await processReceivedEmail(messageId, recipients)
      expect(mocked(emails).saveEmail).toHaveBeenCalledTimes(0)
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
