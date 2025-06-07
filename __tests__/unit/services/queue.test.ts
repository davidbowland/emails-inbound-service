import { http, HttpResponse, server } from '@setup-server'

import { attachment, email } from '../__mocks__'
import { queueApiKey, queueApiUrl } from '@config'
import { sendEmail } from '@services/queue'

jest.mock('@utils/logging')

describe('queue', () => {
  describe('sendEmail', () => {
    const postEndpoint = jest.fn().mockReturnValue(200)
    const target = 'some@email.address'

    beforeAll(() => {
      server.use(
        http.post(`${queueApiUrl}/emails`, async ({ request }) => {
          if (queueApiKey != request.headers.get('x-api-key')) {
            return new HttpResponse(JSON.stringify({ error: 'Invalid API key' }), { status: 403 })
          }

          const body = postEndpoint(await request.json())
          return body ? HttpResponse.json(body) : new HttpResponse(null, { status: 400 })
        }),
      )
    })

    it('should pass email contents to the endpoint', async () => {
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
