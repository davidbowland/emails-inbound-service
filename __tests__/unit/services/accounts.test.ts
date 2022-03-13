import { accounts } from '../__mocks__'
import { accountApiKey, accountApiUrl } from '@config'
import { extractAccountFromAddress, getAccountPreferences } from '@services/accounts'
import { rest, server } from '@setup-server'

describe('accounts', () => {
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

  describe('getAccountPreferences', () => {
    beforeAll(() => {
      server.use(
        rest.get(`${accountApiUrl}/accounts/:accountId`, async (req, res, ctx) => {
          if (accountApiKey != req.headers.get('x-api-key')) {
            return res(ctx.status(403))
          }

          const { accountId } = req.params
          if (!((accountId as string) in accounts)) {
            if (req.url.searchParams.get('default') == 'true') {
              return res(ctx.json(accounts.default))
            }
            return res(ctx.status(404))
          }
          return res(ctx.json(accounts[accountId as string]))
        })
      )
    })

    test.each(Object.keys(accounts))('expect correct account preferences back for account %s', async (accountId) => {
      const result = await getAccountPreferences(accountId, false)
      expect(result).toEqual(accounts[accountId])
    })

    test.each(Object.keys(accounts))(
      'expect correct account preferences back for account %s with default',
      async (accountId) => {
        const result = await getAccountPreferences(accountId, true)
        expect(result).toEqual(accounts[accountId])
      }
    )

    test('expect default account when querying non-existent account with default', async () => {
      const result = await getAccountPreferences('i-should-not-exist', true)
      expect(result).toEqual(accounts.default)
    })

    test('expect reject on 404', async () => {
      await expect(getAccountPreferences('i-should-not-exist', false)).rejects.toBeDefined()
    })
  })
})
