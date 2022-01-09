import { handleIncomingEmail } from '@handlers/incoming-email'
import eventJson from '@events/receive-email.json'
import { SESEvent } from '@types'

describe('incoming-email', () => {
  describe('handleIncomingEmail', () => {
    const event = eventJson as unknown as SESEvent

    test('expect return value', async () => {
      const result = await handleIncomingEmail(event)
      expect(result).toEqual('Hello, world')
    })
  })
})
