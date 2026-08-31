import { attachment, email } from '../__mocks__'
import { queueApiKeyPath } from '@config'
import { sendEmail } from '@services/queue'

const mockGetParameter = jest.fn()
const mockPost = jest.fn()
jest.mock('axios', () => {
  const requestInterceptors: ((config: any) => Promise<any>)[] = []
  return {
    create: jest.fn().mockImplementation(() => ({
      interceptors: {
        request: { use: (onFulfilled: (config: any) => Promise<any>) => requestInterceptors.push(onFulfilled) },
      },
      post: (...args: any[]) => mockPost(...args),
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
    await import('@services/queue')
    const { requestInterceptors } = (await import('axios')) as unknown as {
      requestInterceptors: ((config: any) => Promise<any>)[]
    }
    interceptor = requestInterceptors[requestInterceptors.length - 1]
  })
  return interceptor as (config: any) => Promise<any>
}

describe('queue', () => {
  describe('x-api-key interceptor', () => {
    beforeAll(() => {
      mockGetParameter.mockResolvedValue('ssm-queue-api-key')
    })

    it('should set the header from the SSM parameter', async () => {
      const interceptor = await loadInterceptor()

      const config = await interceptor({ headers: {} })

      expect(mockGetParameter).toHaveBeenCalledWith(queueApiKeyPath)
      expect(config.headers['x-api-key']).toEqual('ssm-queue-api-key')
    })

    it('should read the parameter once however many requests it signs', async () => {
      const interceptor = await loadInterceptor()

      await interceptor({ headers: {} })
      const config = await interceptor({ headers: {} })

      expect(mockGetParameter).toHaveBeenCalledTimes(1)
      expect(config.headers['x-api-key']).toEqual('ssm-queue-api-key')
    })

    it('should reject the request when the parameter cannot be read', async () => {
      const interceptor = await loadInterceptor()
      mockGetParameter.mockRejectedValueOnce(new Error('ParameterNotFound'))

      // Failing loudly is the point: a swallowed error would send the request with no key at all
      await expect(interceptor({ headers: {} })).rejects.toThrow('ParameterNotFound')
    })
  })

  describe('sendEmail', () => {
    const target = 'some@email.address'

    beforeAll(() => {
      mockPost.mockResolvedValue({ status: 201 })
    })

    it('should pass email contents to the endpoint', async () => {
      await sendEmail(target, email, [attachment])

      expect(mockPost).toHaveBeenCalledWith(
        '/emails',
        {
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
        },
        {},
      )
    })
  })
})
