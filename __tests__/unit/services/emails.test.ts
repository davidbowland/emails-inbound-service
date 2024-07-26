import { accounts, parsedContents } from '../__mocks__'
import { emailsApiKey, emailsApiUrl } from '@config'
import {
  extractAccountFromAddress,
  getAccountExists,
  getAccountPreferences,
  registerReceivedEmail,
} from '@services/emails'
import { http, HttpResponse, server } from '@setup-server'
import { ParsedMail } from '@types'

jest.mock('@utils/logging')

describe('emails', () => {
  describe('extractAccountFromAddress', () => {
    test.each([
      ['hello@world.com', 'hello'],
      ['three@email-address.with.sub.domains', 'three'],
      ['"whoa-this@is-weird.com"@email.address', '"whoa-this@is-weird.com"'],
    ])('validate %s is extracted to %s account', async (address, account) => {
      const result = await extractAccountFromAddress(address)
      expect(result).toEqual(account)
    })
  })

  describe('getAccountExists', () => {
    beforeAll(() => {
      server.use(
        http.get(`${emailsApiUrl}/accounts/:accountId`, async ({ params, request }) => {
          if (emailsApiKey != request.headers.get('x-api-key')) {
            return new HttpResponse(JSON.stringify({ error: 'Invalid API key' }), { status: 403 })
          }

          const { accountId } = params
          if (!((accountId as string) in accounts)) {
            return new HttpResponse(null, { status: 404 })
          }
          return HttpResponse.json(accounts[accountId as string])
        })
      )
    })

    test.each(Object.keys(accounts))('expect true for account %s', async (accountId) => {
      const result = await getAccountExists(accountId)
      expect(result).toEqual(true)
    })

    test('expect false when querying non-existent account with default', async () => {
      const result = await getAccountExists('i-should-not-exist')
      expect(result).toEqual(false)
    })
  })

  describe('getAccountPreferences', () => {
    beforeAll(() => {
      server.use(
        http.get(`${emailsApiUrl}/accounts/:accountId/internal`, async ({ params, request }) => {
          if (emailsApiKey != request.headers.get('x-api-key')) {
            return new HttpResponse(JSON.stringify({ error: 'Invalid API key' }), { status: 403 })
          }

          const { accountId } = params
          if (!((accountId as string) in accounts)) {
            return HttpResponse.json(accounts.default)
          }
          return HttpResponse.json(accounts[accountId as string])
        })
      )
    })

    test.each(Object.keys(accounts))('expect correct account preferences back for account %s', async (accountId) => {
      const result = await getAccountPreferences(accountId)
      expect(result).toEqual(accounts[accountId])
    })

    test.each(Object.keys(accounts))(
      'expect correct account preferences back for account %s with default',
      async (accountId) => {
        const result = await getAccountPreferences(accountId)
        expect(result).toEqual(accounts[accountId])
      }
    )

    test('expect default account when querying non-existent account with default', async () => {
      const result = await getAccountPreferences('i-should-not-exist')
      expect(result).toEqual(accounts.default)
    })
  })

  describe('registerReceivedEmail', () => {
    const address = 'account1@domain.com'
    const messageId = 'message-id'
    const mockPutEmail = jest.fn()

    beforeAll(() => {
      server.use(
        http.put(`${emailsApiUrl}/accounts/:accountId/emails/received/:emailId`, async ({ params, request }) => {
          if (emailsApiKey != request.headers.get('x-api-key')) {
            return new HttpResponse(JSON.stringify({ error: 'Invalid API key' }), { status: 403 })
          }

          const { accountId, emailId } = params
          mockPutEmail(accountId, emailId, await request.json())
          return new HttpResponse(null, { status: 204 })
        })
      )
    })

    test('expect endpoint invoked with email', async () => {
      await registerReceivedEmail(address, messageId, parsedContents)

      expect(mockPutEmail).toHaveBeenCalledWith(
        'account1',
        'message-id',
        expect.objectContaining({
          attachments: [
            {
              filename: 'big.file',
              id: 'ytghji87ytgbhj',
              size: 32000,
              type: 'text/plain',
            },
          ],
          from: 'Person A <a@person.email>',
          subject: 'P G Wodehouse',
          to: ['b@person.email'],
          viewed: false,
        })
      )
    })

    test('expect endpoint invoked with email, no missing values', async () => {
      const parsedContentsWithMissingParts = {
        ...parsedContents,
        attachments: [{ checksum: 'fnord', filename: undefined }],
        cc: {
          display: 'Person C <c@person.email>',
          value: [
            {
              address: 'c@person.email',
              name: 'Person C',
            },
          ],
        },
        date: undefined,
        from: undefined,
        subject: undefined,
        to: undefined,
      } as unknown as ParsedMail
      await registerReceivedEmail(address, messageId, parsedContentsWithMissingParts)

      expect(mockPutEmail).toHaveBeenCalledWith(
        'account1',
        'message-id',
        expect.objectContaining({
          attachments: [
            {
              filename: '',
              id: 'fnord',
            },
          ],
          from: 'unknown',
          subject: '',
          to: ['account1@domain.com'],
          viewed: false,
        })
      )
    })
  })
})
