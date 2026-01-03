import { attachment, email } from '../__mocks__'
import { sendEmail } from '@services/queue'

const mockPost = jest.fn()
jest.mock('axios', () => ({
  create: jest.fn().mockImplementation(() => ({ post: (...args) => mockPost(...args) })),
}))
jest.mock('axios-retry')
jest.mock('@utils/logging')

describe('queue', () => {
  describe('sendEmail', () => {
    const target = 'some@email.address'

    beforeAll(() => {
      mockPost.mockResolvedValue({ status: 201 })
    })

    it('should pass email contents to the endpoint', async () => {
      await sendEmail(target, email, [attachment])

      expect(mockPost).toHaveBeenCalledWith(
        '/emails',
        {
          attachments: [attachment],
          from: '"Person A" <do-not@reply.com>',
          headers: {},
          html: '<a href="http://www.gutenberg.org/files/8164/8164-h/8164-h.htm">http://www.gutenberg.org/files/8164/8164-h/8164-h.htm</a>\n',
          references: [],
          replyTo: 'a@person.email',
          sender: '"Person A" <do-not@reply.com>',
          subject: 'P G Wodehouse',
          text: 'http://www.gutenberg.org/files/8164/8164-h/8164-h.htm\n',
          to: [target],
        },
        {},
      )
    })
  })
})
