import AWSXRay from 'aws-xray-sdk-core'
import https from 'https'

interface AxiosErrorLike {
  config?: { url?: string }
  isAxiosError?: boolean
  message?: string
  response?: { status?: number }
}

// An AxiosError carries the whole request on enumerable properties -- config.headers holds the x-api-key and
// config.data holds the request body -- and console expands both, so logging one verbatim publishes the
// credential to CloudWatch. Every downstream call this service makes rejects with one, so the reduction lives
// here rather than at each call site; message, status and url are what a reader needs anyway.
const redact = (value: unknown): unknown => {
  const error = value as AxiosErrorLike | null
  return error?.isAxiosError === true
    ? { message: error.message, status: error.response?.status, url: error.config?.url }
    : value
}

export const log = (...args: unknown[]): unknown => console.log(...args.map(redact))

export const logWarn = (...args: unknown[]): unknown => console.warn(...args.map(redact))

export const logError = (...args: unknown[]): unknown => console.error(...args.map(redact))

export const xrayCapture = (x: any): any => (process.env.AWS_SAM_LOCAL === 'true' ? x : AWSXRay.captureAWSv3Client(x))

export const xrayCaptureHttps = (): void =>
  process.env.AWS_SAM_LOCAL === 'true' ? undefined : AWSXRay.captureHTTPsGlobal(https)
