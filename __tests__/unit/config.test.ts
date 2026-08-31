import { assertRequiredEnv, emailsApiKeyPath, queueApiKeyPath } from '@config'

jest.mock('axios-retry')

describe('config', () => {
  describe('SSM paths', () => {
    it('should read the parameter paths from the environment', () => {
      expect(emailsApiKeyPath).toEqual('/emails-test/emails-api-key')
      expect(queueApiKeyPath).toEqual('/emails-test/queue-api-key')
    })
  })

  describe('assertRequiredEnv', () => {
    it('should not throw when every variable is present', () => {
      expect(() => assertRequiredEnv('EMAILS_API_URL', 'QUEUE_API_URL')).not.toThrow()
    })

    it('should throw naming every missing variable', () => {
      expect(() => assertRequiredEnv('EMAILS_API_URL', 'NOT_SET_ONE', 'NOT_SET_TWO')).toThrow(
        'Missing required environment variable(s): NOT_SET_ONE, NOT_SET_TWO. ' +
          "Add them to this function's Environment.Variables in template.yaml.",
      )
    })
  })
})
