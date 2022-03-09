import { handleIncomingEmail } from '@handlers/incoming-email'
import eventJson from '@events/receive-email.json'
import { mocked } from 'jest-mock'
import * as incomingEmailService from '@services/incoming-email'
import { SESEvent } from '@types'
import * as errorHandlingUtil from '@utils/error-handling'
import * as loggingUtil from '@utils/logging'

jest.mock('@services/incoming-email')
jest.mock('@utils/error-handling')
jest.mock('@utils/logging')

describe('incoming-email handler', () => {
  describe('handleIncomingEmail', () => {
    const event = eventJson as unknown as SESEvent

    beforeAll(() => {
      mocked(incomingEmailService).processReceivedEmail.mockResolvedValue([])
    })

    test('expect items from request passed to processReceivedEmail', async () => {
      await handleIncomingEmail(event)
      expect(mocked(incomingEmailService).processReceivedEmail).toHaveBeenCalledWith(
        'o3vrnil0e2ic28trm7dfhrc2v0clambda4nbp0g1',
        ['johndoe@example.com']
      )
    })

    test('expect error logged and sendErrorEmail called on exception', async () => {
      const error = 'A wild error appeared!'
      mocked(incomingEmailService).processReceivedEmail.mockRejectedValueOnce(error)
      await handleIncomingEmail(event)
      expect(mocked(loggingUtil).logError).toHaveBeenCalledWith(error)
      expect(mocked(errorHandlingUtil).sendErrorEmail).toHaveBeenCalledWith(expect.anything(), error)
    })
  })
})
