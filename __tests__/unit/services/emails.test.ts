import { accounts, parsedContents } from '../__mocks__'
import { emailsApiKeyPath } from '@config'
import {
  bounceReceivedEmail,
  extractAccountFromAddress,
  getAccount,
  notifyReceivedEmail,
  registerReceivedEmail,
} from '@services/emails'
import { ParsedMail } from '@types'

const mockGet = jest.fn()
const mockGetParameter = jest.fn()
const mockPost = jest.fn()
const mockPut = jest.fn()
jest.mock('axios', () => {
  const requestInterceptors: ((config: any) => Promise<any>)[] = []
  return {
    create: jest.fn().mockImplementation(() => ({
      get: (...args: any[]) => mockGet(...args),
      interceptors: {
        request: { use: (onFulfilled: (config: any) => Promise<any>) => requestInterceptors.push(onFulfilled) },
      },
      post: (...args: any[]) => mockPost(...args),
      put: (...args: any[]) => mockPut(...args),
    })),
    requestInterceptors,
  }
})
jest.mock('axios-retry')
jest.mock('@services/ssm', () => ({
  getParameter: (...args: any[]) => mockGetParameter(...args),
  // The real memoize runs here: stubbing it as a pass-through would let a module that read SSM on every
  // request pass the "once per container" test below
  memoized: jest.requireActual('@services/ssm').memoized,
}))
jest.mock('@utils/logging')

// The memoized key lives for the life of the module instance, so a test that needs a cold cache loads its own
const loadInterceptor = async (): Promise<(config: any) => Promise<any>> => {
  let interceptor: ((config: any) => Promise<any>) | undefined
  await jest.isolateModulesAsync(async () => {
    await import('@services/emails')
    const { requestInterceptors } = (await import('axios')) as unknown as {
      requestInterceptors: ((config: any) => Promise<any>)[]
    }
    interceptor = requestInterceptors[requestInterceptors.length - 1]
  })
  return interceptor as (config: any) => Promise<any>
}

describe('emails', () => {
  describe('x-api-key interceptor', () => {
    beforeAll(() => {
      mockGetParameter.mockResolvedValue('ssm-emails-api-key')
    })

    it('should set the header from the SSM parameter', async () => {
      const interceptor = await loadInterceptor()

      const config = await interceptor({ headers: {} })

      expect(mockGetParameter).toHaveBeenCalledWith(emailsApiKeyPath)
      expect(config.headers['x-api-key']).toEqual('ssm-emails-api-key')
    })

    it('should read the parameter once however many requests it signs', async () => {
      const interceptor = await loadInterceptor()

      await interceptor({ headers: {} })
      const config = await interceptor({ headers: {} })

      expect(mockGetParameter).toHaveBeenCalledTimes(1)
      expect(config.headers['x-api-key']).toEqual('ssm-emails-api-key')
    })

    it('should reject the request when the parameter cannot be read', async () => {
      const interceptor = await loadInterceptor()
      mockGetParameter.mockRejectedValueOnce(new Error('ParameterNotFound'))

      // Failing loudly is the point: a swallowed error would send the request with no key at all
      await expect(interceptor({ headers: {} })).rejects.toThrow('ParameterNotFound')
    })
  })

  describe('extractAccountFromAddress', () => {
    it.each([
      ['hello@world.com', 'hello'],
      // Account ids are lowercase everywhere: services/incoming-email.ts dedupes notifications on the value
      // this returns, so an uppercase local part must not become a second account
      ['Hello@World.Com', 'hello'],
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

    it('should fall back to recipient when the to header is present but empty', async () => {
      const parsedContentsWithEmptyTo = {
        ...parsedContents,
        to: { html: '', text: '', value: [] },
      } as unknown as ParsedMail

      await registerReceivedEmail(address, messageId, parsedContentsWithEmptyTo)

      expect(mockPut).toHaveBeenCalledWith(
        '/accounts/account1/emails/received/message-id',
        expect.objectContaining({
          to: ['account1@domain.com'],
        }),
      )
    })

    it('should fall back to recipient when the to header contains only an empty group', async () => {
      const parsedContentsWithGroupTo = {
        ...parsedContents,
        cc: { html: '', text: '', value: [{ group: [], name: 'hidden-recipients' }] },
        to: { html: '', text: '', value: [{ group: [], name: 'undisclosed-recipients' }] },
      } as unknown as ParsedMail

      await registerReceivedEmail(address, messageId, parsedContentsWithGroupTo)

      expect(mockPut).toHaveBeenCalledWith(
        '/accounts/account1/emails/received/message-id',
        expect.objectContaining({
          cc: [],
          to: ['account1@domain.com'],
        }),
      )
    })

    it('should extract addresses when to and cc are arrays of address objects', async () => {
      const parsedContentsWithArrayTo = {
        ...parsedContents,
        cc: [{ html: '', text: '', value: [{ address: 'c@person.email', name: 'Person C' }] }],
        to: [
          { html: '', text: '', value: [{ address: 'one@person.email', name: '' }] },
          { html: '', text: '', value: [{ address: 'two@person.email', name: '' }] },
        ],
      } as unknown as ParsedMail

      await registerReceivedEmail(address, messageId, parsedContentsWithArrayTo)

      expect(mockPut).toHaveBeenCalledWith(
        '/accounts/account1/emails/received/message-id',
        expect.objectContaining({
          cc: ['c@person.email'],
          to: ['one@person.email', 'two@person.email'],
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

  describe('notifyReceivedEmail', () => {
    const accountId = 'account1'
    const messageId = 'message-id-123'

    beforeAll(() => {
      mockPost.mockResolvedValue({ status: 204 })
    })

    it('should invoke the notify endpoint with an empty body', async () => {
      await notifyReceivedEmail(accountId, messageId)

      expect(mockPost).toHaveBeenCalledWith('/accounts/account1/emails/received/message-id-123/notify', {})
    })

    it('should encode the account id and message id', async () => {
      await notifyReceivedEmail('user+tag', 'message@id.with.dots')

      expect(mockPost).toHaveBeenCalledWith('/accounts/user%2Btag/emails/received/message%40id.with.dots/notify', {})
    })

    it('should reject when the endpoint rejects', async () => {
      mockPost.mockRejectedValueOnce(new Error('Internal server error'))

      await expect(notifyReceivedEmail(accountId, messageId)).rejects.toThrow('Internal server error')
    })
  })
})
