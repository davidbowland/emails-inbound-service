import { matchesSenderRule, shouldBounceSender } from '@utils/bounce'
import * as logging from '@utils/logging'

jest.mock('@utils/logging')

describe('bounce', () => {
  describe('matchesSenderRule', () => {
    it.each([
      ['x@domain.com', '@domain.com', true],
      ['x@sub.domain.com', '@domain.com', true],
      ['x@notdomain.com', '@domain.com', false],
      ['X@DOMAIN.COM', '@Domain.Com', true],
      ['x@domain.com.evil', '@domain.com', false],
      ['x@domain.com', '@', false],
      ['x@domain.com', '@x@domain.com', false],
      ['x@domain.com', 'domain.com', true],
      ['x@sub.domain.com', 'domain.com', true],
      ['x@notdomain.com', 'domain.com', false],
      ['x@domain.com', 'x@domain.com', true],
      ['y@domain.com', 'x@domain.com', false],
      ['x@sub.domain.com', 'x@domain.com', false],
      ['x@domain.com', '*', false],
      ['x@domain.com', '', false],
      ['no-at-sign', '', false],
      ['', '@domain.com', false],
    ])('matchesSenderRule(%p, %p) is %p', (address, rule, expected) => {
      expect(matchesSenderRule(address, rule)).toBe(expected)
    })

    it('should treat regex metacharacters literally', () => {
      expect(matchesSenderRule('x@aaaa.com', '(a+)+$')).toBe(false)
      expect(matchesSenderRule('x@a.com', '@.*')).toBe(false)
    })
  })

  describe('shouldBounceSender', () => {
    it('should return false when no bounce settings', () => {
      const result = shouldBounceSender('test@example.com', [])

      expect(result).toBe(false)
    })

    it('should return true when sender setting is wildcard', () => {
      const bounceSenders: string[] = ['*']
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

    it('should handle multiple bounce settings', () => {
      const bounceSenders: string[] = ['spam@bad.com', 'evil.com']

      expect(shouldBounceSender('spam@bad.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('test@evil.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('good@example.com', bounceSenders)).toBe(false)
    })

    it('should return true with wildcard in array', () => {
      const bounceSenders: string[] = ['*', 'example.com']

      expect(shouldBounceSender('any@domain.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('test@example.com', bounceSenders)).toBe(true)
    })

    it('should match an @domain rule for the domain and its subdomains only', () => {
      const bounceSenders: string[] = ['@domain.com']

      expect(shouldBounceSender('x@domain.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('x@sub.domain.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('x@notdomain.com', bounceSenders)).toBe(false)
    })

    it('should skip non-string settings', () => {
      const bounceSenders = [42, null, { domain: 'example.com' }, 'example.com'] as unknown as string[]

      expect(shouldBounceSender('test@example.com', bounceSenders)).toBe(true)
      expect(shouldBounceSender('test@other.com', bounceSenders)).toBe(false)
    })

    it('should log only the matching rule index', () => {
      shouldBounceSender('test@sub.example.com', ['spam@bad.com', '@example.com'])

      expect(jest.mocked(logging).log).toHaveBeenCalledWith('Bouncing sender match', { ruleIndex: 1 })
    })

    it('should not log when no rule matches', () => {
      shouldBounceSender('test@example.com', ['other.com'])

      expect(jest.mocked(logging).log).not.toHaveBeenCalled()
    })
  })
})
