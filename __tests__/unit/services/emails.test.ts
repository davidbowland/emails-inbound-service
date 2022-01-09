import { email, messageId } from '../__mocks__'
import { emailApiKeyName, emailApiUrl } from '@config'
import { mocked } from 'jest-mock'
import * as apiKeys from '@services/api-keys'
import { saveEmail } from '@services/emails'
import { rest, server } from '@setup-server'

jest.mock('@services/api-keys')

describe('emails', () => {
  describe('saveEmail', () => {
    const emailApiKey = '5rfc98iuhg'
    const postEndpoint = jest.fn().mockReturnValue(200)

    beforeAll(() => {
      server.use(
        rest.put(`${emailApiUrl}/v1/emails/:id`, async (req, res, ctx) => {
          const { id } = req.params
          if (emailApiKey != req.headers.get('x-api-key')) {
            return res(ctx.status(403))
          } else if (id != messageId) {
            return res(ctx.status(404))
          }

          const body = postEndpoint(req.body)
          return res(body ? ctx.json(body) : ctx.status(400))
        })
      )

      mocked(apiKeys).getApiKey.mockResolvedValue(emailApiKey)
    })

    test('expect API key fetched', async () => {
      await saveEmail(email)
      expect(mocked(apiKeys).getApiKey).toHaveBeenCalledWith(emailApiKeyName)
    })

    test('expect email contents to be passed to the endpoint', async () => {
      await saveEmail(email)
      expect(postEndpoint).toHaveBeenCalledWith(email)
    })
  })
})
