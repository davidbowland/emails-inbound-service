import { handleIncomingEmail } from '@handlers/incoming-email'
import eventJson from '@events/receive-email.json'
import { mocked } from 'jest-mock'
import * as incomingEmailService from '@services/incoming-email'
import { SESEvent } from '@types'

jest.mock('@services/incoming-email')

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
  })
})
