import { request } from '../__mocks__'
import { emailFrom, notificationTarget } from '@config'
import { mocked } from 'jest-mock'
import * as logging from '@utils/logging'
import { sendErrorEmail } from '@utils/error-handling'

const mockSendRawEmail = jest.fn()
jest.mock('@services/queue', () => ({
  sendRawEmail: (...args) => mockSendRawEmail(...args),
}))
jest.mock('@utils/logging')

describe('error-handling', () => {
  describe('sendErrorEmail', () => {
    const error = new Error('A wild error appeared')
    const record = request.Records[0]

    beforeAll(() => {
      mockSendRawEmail.mockRejectedValue(undefined)
      mocked(logging).logError.mockResolvedValue(undefined)
    })

    test('expect sendErrorEmail logs error', async () => {
      await sendErrorEmail(record, error)
      expect(mocked(logging).logError).toHaveBeenCalledWith(error)
    })

    test('expect sendErrorEmail called with error information', async () => {
      await sendErrorEmail(record, error)
      expect(mockSendRawEmail).toHaveBeenCalledWith(
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
      mockSendRawEmail.mockRejectedValueOnce(undefined)
      const result = await sendErrorEmail(record, error)
      expect(result).toEqual('Error: A wild error appeared')
    })
  })
})
