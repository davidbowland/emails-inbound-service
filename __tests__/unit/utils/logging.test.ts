import { S3 } from '@aws-sdk/client-s3'
import * as AWSXRay from 'aws-xray-sdk-core'
import https from 'https'

import { log, logError, logWarn, xrayCapture, xrayCaptureHttps } from '@utils/logging'

jest.mock('aws-xray-sdk-core')

describe('logging', () => {
  // Shaped like the AxiosError a rejected downstream call produces: the api key sits on enumerable
  // config.headers, well within console's default inspection depth
  const axiosError = {
    config: {
      headers: { 'x-api-key': 'super-secret-api-key' },
      url: '/accounts/admin/emails/received/message-id/notify',
    },
    isAxiosError: true,
    message: 'Request failed with status code 403',
    response: { data: { message: 'Forbidden' }, status: 403 },
  }

  beforeAll(() => {
    console.error = jest.fn()
    console.warn = jest.fn()
    console.log = jest.fn()
  })

  describe('log', () => {
    it.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])('should call logFunc with message', async (value) => {
      const message = `Log message for value ${JSON.stringify(value)}`
      await log(message)

      expect(console.log).toHaveBeenCalledWith(message)
    })
  })

  describe('logWarn', () => {
    it.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])('should call logFunc with message', async (value) => {
      const message = `Log message for value ${JSON.stringify(value)}`
      await logWarn(message)

      expect(console.warn).toHaveBeenCalledWith(message)
    })
  })

  describe('logError', () => {
    it.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])('should call logFunc with message', async (value) => {
      const message = `Error message for value ${JSON.stringify(value)}`
      const error = new Error(message)
      await logError(error)

      expect(console.error).toHaveBeenCalledWith(error)
    })

    it('should reduce an axios error to its message, status and url', async () => {
      await logError(axiosError)

      expect(console.error).toHaveBeenCalledWith({
        message: 'Request failed with status code 403',
        status: 403,
        url: '/accounts/admin/emails/received/message-id/notify',
      })
    })

    it('should not log the api key carried by an axios error', async () => {
      await logError('Failure calling emails-email-api', axiosError)

      expect(JSON.stringify(jest.mocked(console.error).mock.calls)).not.toContain('super-secret-api-key')
    })
  })

  describe('xrayCapture', () => {
    const capturedS3 = 'captured-s3' as unknown as S3
    const s3 = 's3'

    beforeAll(() => {
      jest.mocked(AWSXRay).captureAWSv3Client.mockReturnValue(capturedS3)
    })

    it('should call AWSXRay.captureAWSv3Client when x-ray is enabled (not running locally)', () => {
      process.env.AWS_SAM_LOCAL = 'false'
      const result = xrayCapture(s3)

      expect(AWSXRay.captureAWSv3Client).toHaveBeenCalledWith(s3)
      expect(result).toEqual(capturedS3)
    })

    it('should return same object when x-ray is disabled (running locally)', () => {
      process.env.AWS_SAM_LOCAL = 'true'
      const result = xrayCapture(s3)

      expect(AWSXRay.captureAWSv3Client).toHaveBeenCalledTimes(0)
      expect(result).toEqual(s3)
    })
  })

  describe('xrayCaptureHttps', () => {
    it('should call AWSXRay.captureHTTPsGlobal when x-ray is enabled (not running locally)', () => {
      process.env.AWS_SAM_LOCAL = 'false'
      xrayCaptureHttps()

      expect(AWSXRay.captureHTTPsGlobal).toHaveBeenCalledWith(https)
    })

    it('should not call captureHTTPsGlobal when x-ray is disabled (running locally)', () => {
      process.env.AWS_SAM_LOCAL = 'true'
      xrayCaptureHttps()

      expect(AWSXRay.captureHTTPsGlobal).toHaveBeenCalledTimes(0)
    })
  })
})
