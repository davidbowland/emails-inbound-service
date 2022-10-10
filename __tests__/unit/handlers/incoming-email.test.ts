import { mocked } from 'jest-mock'

import * as incomingEmailService from '@services/incoming-email'
import * as loggingUtil from '@utils/logging'
import { SESEvent } from '@types'
import eventJson from '@events/receive-email.json'
import { handleIncomingEmail } from '@handlers/incoming-email'

jest.mock('@services/incoming-email')
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
    })
  })
})
