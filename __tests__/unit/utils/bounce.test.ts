import { shouldBounceSender } from '@utils/bounce'

describe('bounce', () => {
  describe('shouldBounceSender', () => {
    it('should return false when no bounce settings', () => {
      const result = shouldBounceSender('test@example.com', [])

      expect(result).toBe(false)
    })

    it('should return true when sender is falsey', () => {
      const bounceSenders: string[] = ['']
      const result = shouldBounceSender('test@example.com', bounceSenders)

      expect(result).toBe(true)
    })

    it('should return true for exact email match', () => {
      const bounceSenders: string[] = ['test@example.com']
      const result = shouldBounceSender('test@example.com', bounceSenders)

      expect(result).toBe(true)
    })

    it('should return true for case insensitive email match', () => {
      const bounceSenders: string[] = ['TEST@EXAMPLE.COM']
      const result = shouldBounceSender('test@example.com', bounceSenders)

      expect(result).toBe(true)
    })

    it('should return true for exact domain match', () => {
      const bounceSenders: string[] = ['example.com']
      const result = shouldBounceSender('test@example.com', bounceSenders)

      expect(result).toBe(true)
    })

    it('should return true for subdomain match', () => {
      const bounceSenders: string[] = ['example.com']
      const result = shouldBounceSender('test@mail.example.com', bounceSenders)

      expect(result).toBe(true)
    })

    it('should return false for partial domain match', () => {
      const bounceSenders: string[] = ['example.com']
      const result = shouldBounceSender('test@notexample.com', bounceSenders)

      expect(result).toBe(false)
    })

    it('should return false when subdomain setting does not match parent domain', () => {
      const bounceSenders: string[] = ['mail.example.com']
      const result = shouldBounceSender('test@example.com', bounceSenders)

      expect(result).toBe(false)
    })

    it('should handle comma-separated senders', () => {
      const bounceSenders: string[] = ['spam@bad.com,evil.com,another@blocked.net']

      expect(shouldBounceSender('spam@bad.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('test@evil.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('another@blocked.net', bounceSenders)).toBe(true)
      expect(shouldBounceSender('good@example.com', bounceSenders)).toBe(false)
    })

    it('should handle multiple bounce settings', () => {
      const bounceSenders: string[] = ['spam@bad.com', 'evil.com']

      expect(shouldBounceSender('spam@bad.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('test@evil.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('good@example.com', bounceSenders)).toBe(false)
    })

    it('should handle whitespace in comma-separated senders', () => {
      const bounceSenders: string[] = [' spam@bad.com , evil.com , another@blocked.net ']

      expect(shouldBounceSender('spam@bad.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('test@evil.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('another@blocked.net', bounceSenders)).toBe(true)
    })
  })
})
