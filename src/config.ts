import axios from 'axios'
import axiosRetry from 'axios-retry'

// Axios

axiosRetry(axios, { retries: 3 })

// API

export const accountApiKey = process.env.ACCOUNT_API_KEY as string
export const accountApiUrl = process.env.ACCOUNT_API_URL as string
export const queueApiKey = process.env.QUEUE_API_KEY as string
export const queueApiUrl = process.env.QUEUE_API_URL as string

// S3

export const emailBucket = process.env.EMAIL_BUCKET as string

// SES

export const emailFrom = process.env.EMAIL_FROM as string
export const emailRegion = process.env.EMAIL_REGION as string
export const notificationTarget = 'dbowland1+emails-service-error' + '@gmail.com'
