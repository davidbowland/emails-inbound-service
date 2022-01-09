import { emailBucket } from '@config'
import { copyS3Object, getS3Object, putS3Object } from '@services/s3'

const mockCopyObject = jest.fn()
const mockGetObject = jest.fn()
const mockPutObject = jest.fn()
jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    copyObject: (...args) => ({ promise: () => mockCopyObject(...args) }),
    getObject: (...args) => ({ promise: () => mockGetObject(...args) }),
    putObject: (...args) => ({ promise: () => mockPutObject(...args) }),
  })),
}))

describe('S3', () => {
  const key = 'prefix/key'

  describe('copyS3Object', () => {
    const fromKey = 'prefix/another-key'

    beforeAll(() => {
      mockCopyObject.mockResolvedValue({})
    })

    test('expect keys passed to S3 as object', async () => {
      await copyS3Object(fromKey, key)
      expect(mockCopyObject).toHaveBeenCalledWith({
        Bucket: emailBucket,
        CopySource: `/${emailBucket}/${fromKey}`,
        Key: key,
      })
    })

    test('expect reject when promise rejects', async () => {
      const rejectReason = 'unable to foo the bar'
      mockCopyObject.mockRejectedValueOnce(rejectReason)
      await expect(copyS3Object(fromKey, key)).rejects.toEqual(rejectReason)
    })
  })

  describe('getS3Object', () => {
    const expectedObject = 'thar-be-values-here'

    beforeAll(() => {
      mockGetObject.mockResolvedValue({ Body: expectedObject })
    })

    test('expect key passed to S3 as object', async () => {
      await getS3Object(key)
      expect(mockGetObject).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
    })

    test('expect expectedObject as result', async () => {
      const result = await getS3Object(key)
      expect(result).toEqual(expectedObject)
    })

    test('expect empty result when body missing', async () => {
      mockGetObject.mockResolvedValueOnce({})
      const result = await getS3Object(key)
      expect(result).toEqual(undefined)
    })
  })

  describe('putS3Object', () => {
    const metadata = {
      'Content-Type': 'text/plain',
    }
    const valueToPut = 'Hello, world!'

    test('expect key and data passed to S3 as object', async () => {
      await putS3Object(key, valueToPut, metadata)
      expect(mockPutObject).toHaveBeenCalledWith({
        Body: valueToPut,
        Bucket: emailBucket,
        Key: key,
        Metadata: metadata,
      })
    })

    test('expect no metadata passed to S3 when omitted', async () => {
      await putS3Object(key, valueToPut)
      expect(mockPutObject).toHaveBeenCalledWith({ Body: valueToPut, Bucket: emailBucket, Key: key, Metadata: {} })
    })

    test('expect reject when promise rejects', async () => {
      const rejectReason = 'unable to foo the bar'
      mockPutObject.mockRejectedValueOnce(rejectReason)
      await expect(putS3Object(key, valueToPut, metadata)).rejects.toEqual(rejectReason)
    })
  })
})
