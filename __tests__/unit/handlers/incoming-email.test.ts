import spamVerdictEventJson from '@events/receive-email-spam-verdict.json'
import unknownRecipientSpamEventJson from '@events/receive-email-unknown-recipient-spam.json'
import eventJson from '@events/receive-email.json'
import { handleIncomingEmail } from '@handlers/incoming-email'
import * as incomingEmailService from '@services/incoming-email'
import { SESEvent } from '@types'
import * as loggingUtil from '@utils/logging'

jest.mock('@services/incoming-email')
jest.mock('@utils/logging')

describe('incoming-email handler', () => {
  describe('handleIncomingEmail', () => {
    const event = eventJson as unknown as SESEvent

    it('should pass the message id, SES receipt and envelope sender to processReceivedEmail', async () => {
      await handleIncomingEmail(event)

      expect(incomingEmailService.processReceivedEmail).toHaveBeenCalledWith(
        'o3vrnil0e2ic28trm7dfhrc2v0clambda4nbp0g1',
        event.Records[0].ses.receipt,
        'janedoe@example.com',
      )
    })

    it('should pass a receipt carrying an SES spam verdict FAIL through unchanged', async () => {
      const spamEvent = spamVerdictEventJson as unknown as SESEvent

      await handleIncomingEmail(spamEvent)

      expect(incomingEmailService.processReceivedEmail).toHaveBeenCalledWith(
        'o3vrnil0e2ic28trm7dfhrc2v0clambda4nbp0g1',
        expect.objectContaining({ recipients: ['johndoe@example.com'], spamVerdict: { status: 'FAIL' } }),
        'janedoe@example.com',
      )
    })

    it('should pass an unresolvable recipient with an SES spam verdict FAIL through unchanged', async () => {
      const unknownRecipientEvent = unknownRecipientSpamEventJson as unknown as SESEvent

      await handleIncomingEmail(unknownRecipientEvent)

      expect(incomingEmailService.processReceivedEmail).toHaveBeenCalledWith(
        'unknownrecipientspamexample0000000000001',
        expect.objectContaining({ recipients: ['nobody@example.com'], spamVerdict: { status: 'FAIL' } }),
        'janedoe@example.com',
      )
    })

    it('should log error when an exception occurs', async () => {
      const error = 'A wild error appeared!'
      jest.mocked(incomingEmailService).processReceivedEmail.mockRejectedValueOnce(error)
      await handleIncomingEmail(event)

      expect(loggingUtil.logError).toHaveBeenCalledWith(error)
    })

    it('should log a classification error rather than let it escape the handler', async () => {
      const error = new Error('classification failed')
      jest.mocked(incomingEmailService).processReceivedEmail.mockRejectedValueOnce(error)

      await expect(handleIncomingEmail(spamVerdictEventJson as unknown as SESEvent)).resolves.toBeUndefined()

      expect(loggingUtil.logError).toHaveBeenCalledWith(error)
    })

    it('should throw when a required environment variable is missing', async () => {
      // The restore sits in a finally because a failed expectation skips an inline one, and every test that
      // runs afterwards would then see an environment this test deleted
      try {
        delete process.env.SSM_EMAILS_API_KEY_PATH

        const importHandler = jest.isolateModulesAsync(async () => {
          await import('@handlers/incoming-email')
        })
        await expect(importHandler).rejects.toThrow('Missing required environment variable(s): SSM_EMAILS_API_KEY_PATH')
      } finally {
        process.env.SSM_EMAILS_API_KEY_PATH = '/emails-test/emails-api-key'
      }
    })
  })
})
