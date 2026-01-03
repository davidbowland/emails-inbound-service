import { accounts, parsedContents } from '../__mocks__'
import { bounceReceivedEmail, extractAccountFromAddress, getAccount, registerReceivedEmail } from '@services/emails'
import { ParsedMail } from '@types'

const mockGet = jest.fn()
const mockPut = jest.fn()
const mockPost = jest.fn()
jest.mock('axios', () => ({
  create: jest.fn().mockImplementation(() => ({
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
  })),
}))
jest.mock('axios-retry')
jest.mock('@utils/logging')

describe('emails', () => {
  describe('extractAccountFromAddress', () => {
    it.each([
      ['hello@world.com', 'hello'],
      ['three@email-address.with.sub.domains', 'three'],
      ['"whoa-this@is-weird.com"@email.address', '"whoa-this@is-weird.com"'],
    ])('should extract %s to %s account', (address, account) => {
      const result = extractAccountFromAddress(address)
      expect(result).toEqual(account)
    })
  })

  describe('getAccount', () => {
    it.each(Object.keys(accounts))('should return correct account preferences for account %s', async (accountId) => {
      mockGet.mockResolvedValue({ data: accounts[accountId] })

      const result = await getAccount(accountId)
      expect(result).toEqual(accounts[accountId])
      expect(mockGet).toHaveBeenCalledWith(`/accounts/${accountId}`)
    })

    it('should throw error when querying non-existent account', async () => {
      mockGet.mockRejectedValue(new Error('Not found'))

      await expect(getAccount('i-should-not-exist')).rejects.toThrow('Not found')
    })
  })

  describe('registerReceivedEmail', () => {
    const address = 'account1@domain.com'
    const messageId = 'message-id'

    beforeAll(() => {
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

  describe('bounceReceivedEmail', () => {
    const address = 'account1@domain.com'
    const messageId = 'message-id-123'

    beforeAll(() => {
      mockPost.mockResolvedValue({ status: 200 })
    })

    it('should invoke bounce endpoint with correct parameters', async () => {
      await bounceReceivedEmail(address, messageId)

      expect(mockPost).toHaveBeenCalledWith('/accounts/account1/emails/received/message-id-123/bounce', {})
    })

    it('should handle special characters in address and messageId', async () => {
      const specialAddress = 'user+tag@domain.com'
      const specialMessageId = 'message@id.with.dots'

      await bounceReceivedEmail(specialAddress, specialMessageId)

      expect(mockPost).toHaveBeenCalledWith('/accounts/user%2Btag/emails/received/message%40id.with.dots/bounce', {})
    })
  })
})
