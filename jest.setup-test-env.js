// DynamoDB

process.env.DYNAMODB_TABLE_NAME = 'email-table'

// Console

console.info = jest.fn()
console.log = jest.fn()
console.warn = jest.fn()
console.error = jest.fn()
