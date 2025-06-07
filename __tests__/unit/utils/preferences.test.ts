import { accounts } from '../__mocks__'
import * as emailsService from '@services/emails'
import { aggregatePreferences } from '@utils/preferences'

jest.mock('@services/emails')

describe('preferences', () => {
  describe('aggregatePreferences', () => {
    const defaultAccount = 'default@email.address'
    const account1 = 'account1@email.address'
    const account2 = 'account2@email.address'

    beforeAll(() => {
      jest
        .mocked(emailsService)
        .extractAccountFromAddress.mockImplementation((email) => email.replace(/@[a-z0-9.-]+$/i, ''))
      jest.mocked(emailsService).getAccountPreferences.mockImplementation((account) => accounts[account])
    })

    it('should call account extraction', async () => {
      await aggregatePreferences([defaultAccount, account1, account2])

      expect(emailsService.extractAccountFromAddress).toHaveBeenCalledWith(defaultAccount)
      expect(emailsService.extractAccountFromAddress).toHaveBeenCalledWith(account1)
      expect(emailsService.extractAccountFromAddress).toHaveBeenCalledWith(account2)
    })

    it('should return preferences', async () => {
      const defaultAccount = 'default@email.address'
      const result = await aggregatePreferences([defaultAccount])

      expect(result).toEqual({
        ...accounts.default,
        forwardTargets: accounts.default.forwardTargets,
      })
    })

    it('should merge preferences', async () => {
      const result = await aggregatePreferences([defaultAccount, account1, account2])

      expect(result).toEqual({
        forwardTargets: accounts.default.forwardTargets,
      })
    })
  })
})
