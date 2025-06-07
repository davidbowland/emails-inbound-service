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

    beforeAll(() => {
      jest.mocked(incomingEmailService).processReceivedEmail.mockResolvedValue([])
    })

    it('should pass items from request to processReceivedEmail', async () => {
      await handleIncomingEmail(event)

      expect(incomingEmailService.processReceivedEmail).toHaveBeenCalledWith(
        'o3vrnil0e2ic28trm7dfhrc2v0clambda4nbp0g1',
        ['johndoe@example.com'],
      )
    })

    it('should log error when an exception occurs', async () => {
      const error = 'A wild error appeared!'
      jest.mocked(incomingEmailService).processReceivedEmail.mockRejectedValueOnce(error)
      await handleIncomingEmail(event)

      expect(loggingUtil.logError).toHaveBeenCalledWith(error)
    })
  })
})
