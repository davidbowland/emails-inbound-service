import { mocked } from 'jest-mock'

import * as emailsService from '@services/emails'
import { accounts } from '../__mocks__'
import { aggregatePreferences } from '@utils/preferences'

jest.mock('@services/emails')

describe('preferences', () => {
  describe('aggregatePreferences', () => {
    const defaultAccount = 'default@email.address'
    const account1 = 'account1@email.address'
    const account2 = 'account2@email.address'

    beforeAll(() => {
      mocked(emailsService).extractAccountFromAddress.mockImplementation((email) => email.replace(/@[a-z0-9.-]+$/i, ''))
      mocked(emailsService).getAccountPreferences.mockImplementation((account) => accounts[account])
    })

    test('expect account extraction called', async () => {
      await aggregatePreferences([defaultAccount, account1, account2])

      expect(mocked(emailsService).extractAccountFromAddress).toHaveBeenCalledWith(defaultAccount)
      expect(mocked(emailsService).extractAccountFromAddress).toHaveBeenCalledWith(account1)
      expect(mocked(emailsService).extractAccountFromAddress).toHaveBeenCalledWith(account2)
    })

    test('expect preferences returned', async () => {
      const defaultAccount = 'default@email.address'
      const result = await aggregatePreferences([defaultAccount])

      expect(result).toEqual({
        ...accounts.default,
        forwardTargets: accounts.default.forwardTargets,
      })
    })

    test('expect preferences merged', async () => {
      const result = await aggregatePreferences([defaultAccount, account1, account2])

      expect(result).toEqual({
        forwardTargets: accounts.default.forwardTargets,
      })
    })
  })
})
