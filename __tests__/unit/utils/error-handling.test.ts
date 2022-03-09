import { request } from '../__mocks__'
import { emailFrom, notificationTarget } from '@config'
import { mocked } from 'jest-mock'
import * as queue from '@services/queue'
import * as logging from '@utils/logging'
import { sendErrorEmail } from '@utils/error-handling'

jest.mock('@services/queue')
jest.mock('@utils/logging')

describe('error-handling', () => {
  describe('sendErrorEmail', () => {
    const error = new Error('A wild error appeared')
    const record = request.Records[0]

    beforeAll(() => {
      mocked(queue).sendRawEmail.mockResolvedValue(undefined)
    })

    test('expect sendErrorEmail called with error information', async () => {
      await sendErrorEmail(record, error)
      expect(mocked(queue).sendRawEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: emailFrom,
          replyTo: emailFrom,
          sender: emailFrom,
          subject: 'Error processing SES inbound',
          to: [notificationTarget],
        })
      )
    })

    test('expect error message returned', async () => {
      const result = await sendErrorEmail(record, error)
      expect(result).toEqual('Error: A wild error appeared')
    })

    test('expect error message on sendErrorEmail reject', async () => {
      const newError = 'This is too much'
      mocked(queue).sendRawEmail.mockRejectedValueOnce(newError)
      const result = await sendErrorEmail(record, error)
      expect(mocked(logging).logError).toHaveBeenCalledWith(newError)
      expect(result).toEqual('Error: A wild error appeared')
    })
  })
})
