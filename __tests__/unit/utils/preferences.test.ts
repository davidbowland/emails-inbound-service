import { accounts } from '../__mocks__'
import { mocked } from 'jest-mock'
import * as accountsService from '@services/accounts'
import { aggregatePreferences } from '@utils/preferences'

jest.mock('@services/accounts')

describe('preferences', () => {
  describe('aggregatePreferences', () => {
    const defaultAccount = 'default@email.address'
    const account1 = 'account1@email.address'
    const account2 = 'account2@email.address'

    beforeAll(() => {
      mocked(accountsService).extractAccountFromAddress.mockImplementation((email) =>
        email.replace(/@[a-z0-9.-]+$/i, '')
      )
      mocked(accountsService).getAccountPreferences.mockImplementation((account) => accounts[account])
    })

    test('expect account extraction called', async () => {
      await aggregatePreferences([defaultAccount, account1, account2])
      expect(mocked(accountsService).extractAccountFromAddress).toHaveBeenCalledWith(defaultAccount)
      expect(mocked(accountsService).extractAccountFromAddress).toHaveBeenCalledWith(account1)
      expect(mocked(accountsService).extractAccountFromAddress).toHaveBeenCalledWith(account2)
    })

    test('expect preferences returned', async () => {
      const defaultAccount = 'default@email.address'
      const result = await aggregatePreferences([defaultAccount])
      expect(result).toEqual({
        ...accounts.default.inbound,
        forwardTargets: new Set(accounts.default.inbound.forwardTargets),
      })
    })

    test('expect preferences merged', async () => {
      const result = await aggregatePreferences([defaultAccount, account1, account2])
      expect(result).toEqual({ forwardTargets: new Set(accounts.default.inbound.forwardTargets), save: true })
    })
  })
})
