import { attachment, email } from '../__mocks__'
import { queueApiKeyName, queueApiUrl } from '@config'
import { mocked } from 'jest-mock'
import * as apiKeys from '@services/api-keys'
import { sendEmail } from '@services/queue'
import { rest, server } from '@setup-server'

jest.mock('@services/api-keys')

describe('queue', () => {
  describe('sendEmail', () => {
    const postEndpoint = jest.fn().mockReturnValue(200)
    const queueApiKey = '23efvb67yujkm'
    const target = 'some@email.address'

    beforeAll(() => {
      server.use(
        rest.post(`${queueApiUrl}/v1/emails`, async (req, res, ctx) => {
          if (queueApiKey != req.headers.get('x-api-key')) {
            return res(ctx.status(403))
          }

          const body = postEndpoint(req.body)
          return res(body ? ctx.json(body) : ctx.status(400))
        })
      )
      mocked(apiKeys).getApiKey.mockResolvedValue(queueApiKey)
    })

    test('expect API key fetched', async () => {
      await sendEmail(target, email, [attachment])
      expect(mocked(apiKeys).getApiKey).toHaveBeenCalledWith(queueApiKeyName)
    })

    test('expect email contents to be passed to the endpoint', async () => {
      await sendEmail(target, email, [attachment])
      expect(postEndpoint).toHaveBeenCalledWith({
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
      })
    })
  })
})
