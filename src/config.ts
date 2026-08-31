import axios from 'axios'
import axiosRetry from 'axios-retry'

// Axios

axiosRetry(axios, { retries: 3 })

// API

export const emailsApiUrl = process.env.EMAILS_API_URL as string
export const queueApiUrl = process.env.QUEUE_API_URL as string

// SSM

export const emailsApiKeyPath = process.env.SSM_EMAILS_API_KEY_PATH as string
export const queueApiKeyPath = process.env.SSM_QUEUE_API_KEY_PATH as string

// S3

export const emailBucket = process.env.EMAIL_BUCKET as string

// SES

export const emailFrom = process.env.EMAIL_FROM as string

// Accounts

export const defaultAccountId = process.env.DEFAULT_ACCOUNT_ID as string

// Environment

// Every environment-derived export above is `process.env.X as string`, so an absent variable becomes
// undefined, passes the type checker, and reaches an SDK call as `Name: undefined`. Handlers declare the
// variables they need so the failure is loud and immediate instead of silent.
export const assertRequiredEnv = (...names: string[]): void => {
  const missing = names.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Add them to this function's Environment.Variables in template.yaml.`,
    )
  }
}
