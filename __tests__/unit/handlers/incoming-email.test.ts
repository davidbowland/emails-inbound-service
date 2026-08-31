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

    it('should pass items from request to processReceivedEmail', async () => {
      await handleIncomingEmail(event)

      expect(incomingEmailService.processReceivedEmail).toHaveBeenCalledWith(
        'o3vrnil0e2ic28trm7dfhrc2v0clambda4nbp0g1',
        ['johndoe@example.com'],
        'janedoe@example.com',
      )
    })

    it('should log error when an exception occurs', async () => {
      const error = 'A wild error appeared!'
      jest.mocked(incomingEmailService).processReceivedEmail.mockRejectedValueOnce(error)
      await handleIncomingEmail(event)

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
