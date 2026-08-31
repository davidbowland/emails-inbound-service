import { getParameter, memoized } from '@services/ssm'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-ssm', () => ({
  GetParameterCommand: jest.fn().mockImplementation((x) => x),
  SSMClient: jest.fn(() => ({
    send: (...args: any[]) => mockSend(...args),
  })),
}))
jest.mock('@utils/logging', () => ({
  log: jest.fn(),
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('ssm', () => {
  describe('getParameter', () => {
    const name = '/emails-test/emails-api-key'

    beforeAll(() => {
      mockSend.mockResolvedValue({ Parameter: { Value: 'super-secret' } })
    })

    it('should request the parameter with decryption', async () => {
      await getParameter(name)

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ Name: name, WithDecryption: true }))
    })

    it('should return the parameter value', async () => {
      const result = await getParameter(name)

      expect(result).toEqual('super-secret')
    })

    it('should throw when the parameter has no value', async () => {
      mockSend.mockResolvedValueOnce({ Parameter: {} })

      await expect(getParameter(name)).rejects.toThrow(`SSM parameter ${name} has no value`)
    })

    it('should throw when the parameter is missing', async () => {
      mockSend.mockResolvedValueOnce({})

      await expect(getParameter(name)).rejects.toThrow(`SSM parameter ${name} has no value`)
    })

    it('should reject when the client rejects', async () => {
      mockSend.mockRejectedValueOnce('ParameterNotFound')

      await expect(getParameter(name)).rejects.toEqual('ParameterNotFound')
    })
  })

  describe('memoized', () => {
    it('should return the fetched value', async () => {
      const fetchValue = jest.fn().mockResolvedValue('first-value')

      const result = await memoized(fetchValue)()

      expect(result).toEqual('first-value')
    })

    it('should fetch the value only once', async () => {
      const fetchValue = jest.fn().mockResolvedValue('first-value')
      const getValue = memoized(fetchValue)

      await getValue()
      const result = await getValue()

      expect(fetchValue).toHaveBeenCalledTimes(1)
      expect(result).toEqual('first-value')
    })

    it('should fetch the value once when two calls overlap', async () => {
      let resolveFetch: (value: string) => void = () => undefined
      const fetchValue = jest.fn().mockReturnValue(new Promise<string>((resolve) => (resolveFetch = resolve)))
      const getValue = memoized(fetchValue)

      const first = getValue()
      const second = getValue()
      resolveFetch('first-value')

      expect(await first).toEqual('first-value')
      expect(await second).toEqual('first-value')
      expect(fetchValue).toHaveBeenCalledTimes(1)
    })

    it('should not cache a rejection', async () => {
      const fetchValue = jest
        .fn()
        .mockRejectedValueOnce(new Error('ParameterNotFound'))
        .mockResolvedValue('second-value')
      const getValue = memoized(fetchValue)

      await expect(getValue()).rejects.toThrow('ParameterNotFound')
      const result = await getValue()

      expect(result).toEqual('second-value')
      expect(fetchValue).toHaveBeenCalledTimes(2)
    })

    it('should memoize each value independently', async () => {
      const fetchPublic = jest.fn().mockResolvedValue('public-value')
      const fetchPrivate = jest.fn().mockResolvedValue('private-value')

      const publicValue = await memoized(fetchPublic)()
      const privateValue = await memoized(fetchPrivate)()

      expect(publicValue).toEqual('public-value')
      expect(privateValue).toEqual('private-value')
    })
  })
})
