import axios from 'axios'
import axiosRetry from 'axios-retry'

// Axios

axiosRetry(axios, { retries: 3 })

// API

export const accountApiKeyName = process.env.ACCOUNT_API_KEY_NAME as string
export const accountApiUrl = process.env.ACCOUNT_API_URL as string
export const emailApiKeyName = process.env.EMAIL_API_KEY_NAME as string
export const emailApiUrl = process.env.EMAIL_API_URL as string
export const queueApiKeyName = process.env.QUEUE_API_KEY_NAME as string
export const queueApiUrl = process.env.QUEUE_API_URL as string

// S3

export const emailBucket = process.env.EMAIL_BUCKET as string

// SES

export const emailFrom = process.env.EMAIL_FROM as string
export const emailRegion = process.env.EMAIL_REGION as string
export const notificationTarget = process.env.ERROR_EMAIL as string
