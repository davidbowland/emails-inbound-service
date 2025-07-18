import { accounts, parsedContents } from '../__mocks__'
import { emailsApiKey } from '@config'
import {
  extractAccountFromAddress,
  getAccountExists,
  getAccountPreferences,
  registerReceivedEmail,
} from '@services/emails'
import { ParsedMail } from '@types'

const mockGet = jest.fn()
const mockPut = jest.fn()
jest.mock('axios', () => ({
  create: jest
    .fn()
    .mockImplementation(() => ({ get: (...args) => mockGet(...args), put: (...args) => mockPut(...args) })),
}))
jest.mock('axios-retry')
jest.mock('@utils/logging')

describe('emails', () => {
  describe('extractAccountFromAddress', () => {
    it.each([
      ['hello@world.com', 'hello'],
      ['three@email-address.with.sub.domains', 'three'],
      ['"whoa-this@is-weird.com"@email.address', '"whoa-this@is-weird.com"'],
    ])('should extract %s to %s account', async (address, account) => {
      const result = await extractAccountFromAddress(address)
      expect(result).toEqual(account)
    })
  })

  describe('getAccountExists', () => {
    it.each(Object.keys(accounts))('should return true for account %s', async (accountId) => {
      mockGet.mockResolvedValue({ data: accounts[accountId] })

      const result = await getAccountExists(accountId)
      expect(result).toEqual(true)
      expect(mockGet).toHaveBeenCalledWith(`/accounts/${accountId}`, {
        headers: { 'x-api-key': emailsApiKey, 'x-user-name': accountId },
      })
    })

    it('should return false when querying non-existent account with default', async () => {
      mockGet.mockRejectedValue(new Error('Not found'))

      const result = await getAccountExists('i-should-not-exist')
      expect(result).toEqual(false)
    })
  })

  describe('getAccountPreferences', () => {
    it.each(Object.keys(accounts))('should return correct account preferences for account %s', async (accountId) => {
      mockGet.mockResolvedValue({ data: accounts[accountId] })

      const result = await getAccountPreferences(accountId)
      expect(result).toEqual(accounts[accountId])
      expect(mockGet).toHaveBeenCalledWith(`/accounts/${accountId}/internal`)
    })

    it.each(Object.keys(accounts))(
      'should return correct account preferences for account %s with default',
      async (accountId) => {
        mockGet.mockResolvedValue({ data: accounts[accountId] })

        const result = await getAccountPreferences(accountId)
        expect(result).toEqual(accounts[accountId])
      },
    )

    it('should return default account when querying non-existent account with default', async () => {
      mockGet.mockResolvedValue({ data: accounts.default })

      const result = await getAccountPreferences('i-should-not-exist')
      expect(result).toEqual(accounts.default)
    })
  })

  describe('registerReceivedEmail', () => {
    const address = 'account1@domain.com'
    const messageId = 'message-id'

    beforeEach(() => {
      mockPut.mockResolvedValue({ status: 204 })
    })

    it('should invoke endpoint with email', async () => {
      await registerReceivedEmail(address, messageId, parsedContents)

      expect(mockPut).toHaveBeenCalledWith(
        '/accounts/account1/emails/received/message-id',
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
        }),
      )
    })

    it('should filter out attachments with missing filename and log warning', async () => {
      const parsedContentsWithMissingFilename = {
        ...parsedContents,
        attachments: [
          { checksum: 'invalid-attachment', contentType: 'text/plain', filename: undefined },
          { checksum: 'valid-attachment', contentType: 'text/plain', filename: 'valid.txt', size: 1000 },
        ],
      } as unknown as ParsedMail

      await registerReceivedEmail(address, messageId, parsedContentsWithMissingFilename)

      expect(mockPut).toHaveBeenCalledWith(
        '/accounts/account1/emails/received/message-id',
        expect.objectContaining({
          attachments: [
            {
              filename: 'valid.txt',
              id: 'valid-attachment',
              size: 1000,
              type: 'text/plain',
            },
          ],
        }),
      )
    })

    it('should filter out attachments with empty filename and log warning', async () => {
      const parsedContentsWithEmptyFilename = {
        ...parsedContents,
        attachments: [
          { cid: 'empty-filename', contentType: 'image/png', filename: '' },
          { cid: 'whitespace-filename', contentType: 'application/pdf', filename: '   ' },
          { cid: 'valid-attachment', contentType: 'application/pdf', filename: 'document.pdf', size: 2000 },
        ],
      } as unknown as ParsedMail

      await registerReceivedEmail(address, messageId, parsedContentsWithEmptyFilename)

      expect(mockPut).toHaveBeenCalledWith(
        '/accounts/account1/emails/received/message-id',
        expect.objectContaining({
          attachments: [
            {
              filename: 'document.pdf',
              id: 'valid-attachment',
              size: 2000,
              type: 'application/pdf',
            },
          ],
        }),
      )
    })

    it('should handle email with no attachments', async () => {
      const parsedContentsWithNoAttachments = {
        ...parsedContents,
        attachments: [],
      } as unknown as ParsedMail

      await registerReceivedEmail(address, messageId, parsedContentsWithNoAttachments)

      expect(mockPut).toHaveBeenCalledWith(
        '/accounts/account1/emails/received/message-id',
        expect.objectContaining({
          attachments: [],
        }),
      )
    })

    it('should invoke endpoint with email, handling missing values', async () => {
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

      expect(mockPut).toHaveBeenCalledWith(
        '/accounts/account1/emails/received/message-id',
        expect.objectContaining({
          attachments: [],
          from: 'unknown',
          subject: '',
          to: ['account1@domain.com'],
          viewed: false,
        }),
      )
    })
  })
})
