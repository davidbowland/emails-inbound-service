// API

process.env.EMAILS_API_URL = 'http://emails.api'
process.env.QUEUE_API_URL = 'https://queue.api'
process.env.SSM_EMAILS_API_KEY_PATH = '/emails-test/emails-api-key'
process.env.SSM_QUEUE_API_KEY_PATH = '/emails-test/queue-api-key'

// S3

process.env.EMAIL_BUCKET = 'bucket-without-hole'

// SES

process.env.EMAIL_FROM = 'do-not@reply.com'
process.env.EMAIL_REGION = 'us-east-1'

// Accounts

process.env.DEFAULT_ACCOUNT_ID = 'admin'
