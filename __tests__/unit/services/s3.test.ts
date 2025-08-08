import EventEmitter from 'events'

import { emailBucket } from '@config'
import { copyS3Object, deleteS3Object, getS3Object, putS3Object } from '@services/s3'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-s3', () => ({
  CopyObjectCommand: jest.fn().mockImplementation((x) => x),
  DeleteObjectCommand: jest.fn().mockImplementation((x) => x),
  GetObjectCommand: jest.fn().mockImplementation((x) => x),
  PutObjectCommand: jest.fn().mockImplementation((x) => x),
  S3Client: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('S3', () => {
  const key = 'prefix/key'

  describe('copyS3Object', () => {
    const fromKey = 'prefix/another-key'

    beforeAll(() => {
      mockSend.mockResolvedValue({})
    })

    it('should pass keys to S3 as object', async () => {
      await copyS3Object(fromKey, key)

      expect(mockSend).toHaveBeenCalledWith({
        Bucket: emailBucket,
        CopySource: `/${emailBucket}/${fromKey}`,
        Key: key,
      })
    })

    it('should reject when promise rejects', async () => {
      const rejectReason = 'unable to foo the bar'
      mockSend.mockRejectedValueOnce(rejectReason)

      await expect(copyS3Object(fromKey, key)).rejects.toEqual(rejectReason)
    })
  })

  describe('deleteS3Object', () => {
    it('should pass key to mock', async () => {
      await deleteS3Object(key)

      expect(mockSend).toHaveBeenCalledWith({
        Bucket: emailBucket,
        Key: key,
      })
    })

    it('should reject when promise rejects', async () => {
      const rejectReason = 'unable to foo the bar'
      mockSend.mockRejectedValueOnce(rejectReason)

      await expect(deleteS3Object(key)).rejects.toEqual(rejectReason)
    })
  })

  describe('getS3Object', () => {
    const expectedObject = 'thar-be-values-here'

    const createMockStream = (data: string) => {
      const stream = new EventEmitter()

      // Emit data immediately when listeners are attached
      process.nextTick(() => {
        stream.emit('data', Buffer.from(data))
        stream.emit('end')
      })

      return stream
    }

    it('should pass key to S3 as object', async () => {
      mockSend.mockResolvedValueOnce({ Body: createMockStream(expectedObject) })
      await getS3Object(key)

      expect(mockSend).toHaveBeenCalledWith({ Bucket: emailBucket, Key: key })
    })

    it('should return expectedObject as result', async () => {
      mockSend.mockResolvedValueOnce({ Body: createMockStream(expectedObject) })
      const result = await getS3Object(key)

      expect(result).toEqual(expectedObject)
    })

    it('should handle stream errors', async () => {
      const errorStream = new EventEmitter()
      mockSend.mockResolvedValueOnce({ Body: errorStream })

      process.nextTick(() => {
        errorStream.emit('error', new Error('Stream error'))
      })

      await expect(getS3Object(key)).rejects.toThrow('Stream error')
    })

    it('should handle multiple data chunks', async () => {
      const chunk1 = 'Hello, '
      const chunk2 = 'world!'
      const stream = new EventEmitter()

      mockSend.mockResolvedValueOnce({ Body: stream })

      process.nextTick(() => {
        stream.emit('data', Buffer.from(chunk1))
        stream.emit('data', Buffer.from(chunk2))
        stream.emit('end')
      })

      const result = await getS3Object(key)
      expect(result).toEqual('Hello, world!')
    })
  })

  describe('putS3Object', () => {
    const metadata = {
      'Content-Type': 'text/plain',
    }
    const valueToPut = 'Hello, world!'

    it('should pass key and data to S3 as object', async () => {
      await putS3Object(key, valueToPut, metadata)

      expect(mockSend).toHaveBeenCalledWith({
        Body: valueToPut,
        Bucket: emailBucket,
        Key: key,
        Metadata: metadata,
      })
    })

    it('should not pass metadata to S3 when omitted', async () => {
      await putS3Object(key, valueToPut)

      expect(mockSend).toHaveBeenCalledWith({
        Body: valueToPut,
        Bucket: emailBucket,
        Key: key,
        Metadata: {},
      })
    })

    it('should reject when promise rejects', async () => {
      const rejectReason = 'unable to foo the bar'
      mockSend.mockRejectedValueOnce(rejectReason)

      await expect(putS3Object(key, valueToPut, metadata)).rejects.toEqual(rejectReason)
    })
  })
})
