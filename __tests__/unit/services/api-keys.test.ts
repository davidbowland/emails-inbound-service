import { getApiKey } from '@services/api-keys'

const mockGetApiKeys = jest.fn()
jest.mock('aws-sdk', () => ({
  APIGateway: jest.fn(() => ({
    getApiKeys: (...args) => ({ promise: () => mockGetApiKeys(...args) }),
  })),
}))

describe('api-keys', () => {
  describe('getApiKey', () => {
    const apiKey = 'okjf3wef'
    const keyName = 'api-key'

    beforeAll(() => {
      mockGetApiKeys.mockResolvedValue({ items: [{ value: apiKey }] })
    })

    test('expect API key name passed to APIGateway', async () => {
      await getApiKey(keyName)
      expect(mockGetApiKeys).toHaveBeenCalledWith({
        includeValues: true,
        nameQuery: keyName,
      })
    })

    test('expect API key returned', async () => {
      const result = await getApiKey(keyName)
      expect(result).toEqual(apiKey)
    })
  })
})
