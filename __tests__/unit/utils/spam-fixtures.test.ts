import { readdirSync, readFileSync } from 'fs'
import { simpleParser } from 'mailparser'
import { join } from 'path'

import event from '@events/receive-email.json'
import { ParsedMail, SESReceipt } from '@types'
import { classifyEmail, DEFAULT_SPAM_FILTER, SpamClassification } from '@utils/spam-score'

// Spam fixtures are the 16 analyzed pitches, streamed from S3 into scripts/anonymize-fixture.ts and reviewed by eye
// (D-23). Ham fixtures are synthetic, written from scratch (AC-045).
const SPAM_DIRECTORY = join(__dirname, '../../fixtures/spam')
const HAM_DIRECTORY = join(__dirname, '../../fixtures/ham')

const listFixtures = (directory: string): string[] =>
  readdirSync(directory)
    .filter((name) => name.endsWith('.eml'))
    .sort()
const spamFixtures = listFixtures(SPAM_DIRECTORY)
const hamFixtures = listFixtures(HAM_DIRECTORY)
const allFixtures = [
  ...spamFixtures.map((name) => join(SPAM_DIRECTORY, name)),
  ...hamFixtures.map((name) => join(HAM_DIRECTORY, name)),
]

// Headers stripped; every verdict PASS, so only the content signals decide
const passReceipt = {
  ...event.Records[0].ses.receipt,
  dkimVerdict: { status: 'PASS' },
  dmarcVerdict: { status: 'PASS' },
  spamVerdict: { status: 'PASS' },
  spfVerdict: { status: 'PASS' },
  virusVerdict: { status: 'PASS' },
} as unknown as SESReceipt
const recipientDomains = ['example.net']

const parseFixture = (path: string): Promise<ParsedMail> => simpleParser(readFileSync(path))

const classifyFixture = async (path: string): Promise<SpamClassification> => {
  const parsed = await parseFixture(path)
  const envelopeSender = parsed.from?.value[0]?.address ?? ''
  return classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER)
}

const ALLOWED_DOMAIN = /^(?:[a-z0-9-]+\.)*(?:example\.(?:com|net|org)|[a-z0-9-]+\.example)$/
const FORMAT_CHARACTERS = /\p{Cf}/gu
const EMAIL_DOMAIN = /[a-z0-9._%+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi
const URL_HOST = /\b[a-z][a-z0-9+.-]*:\/\/([^\s/?#<>"')\]]+)/gi
const DOMAIN_LIKE = /\b(?:[a-z0-9-]+\.)+[a-z]{2,24}\b/gi
const FILE_EXTENSIONS = ['csv', 'eml', 'gif', 'htm', 'html', 'jpeg', 'jpg', 'pdf', 'png', 'txt']
const TRANSPORT_HEADER =
  /^(?:received|dkim-signature|arc-.*|return-path|authentication-results|message-id|list-unsubscribe|x-.*)$/

// The raw file plus every decoded part, with format characters removed so a zero-width-broken domain is seen whole
const fixtureTexts = async (path: string): Promise<string[]> => {
  const parsed = await parseFixture(path)
  return [
    readFileSync(path, 'utf8'),
    parsed.subject ?? '',
    parsed.text ?? '',
    typeof parsed.html === 'string' ? parsed.html : '',
    ...parsed.attachments.map((attachment) => attachment.content.toString('utf8')),
  ].map((text) => text.replace(FORMAT_CHARACTERS, ''))
}

const domainTokens = (text: string): string[] => [
  ...Array.from(text.matchAll(EMAIL_DOMAIN), (match) => match[1]),
  ...Array.from(text.matchAll(URL_HOST), (match) => match[1]),
  // Addresses are removed first so a dotted local part (first.last@) is not read as a domain
  ...Array.from(text.replace(EMAIL_DOMAIN, ' ').matchAll(DOMAIN_LIKE), (match) => match[0]).filter(
    (token) => !FILE_EXTENSIONS.includes(token.split('.').pop()?.toLowerCase() ?? ''),
  ),
]

describe('spam fixtures', () => {
  it('should hold 16 pitches and 12 legitimate messages', () => {
    expect(spamFixtures).toEqual(
      Array.from({ length: 16 }, (_, index) => `pitch-${`${index + 1}`.padStart(2, '0')}.eml`),
    )
    expect(hamFixtures).toEqual(
      Array.from({ length: 12 }, (_, index) => `legit-${`${index + 1}`.padStart(2, '0')}.eml`),
    )
  })

  describe('pitches (AC-046)', () => {
    it.each(spamFixtures)('should classify %s as spam at the default sensitivity', async (name) => {
      const result = await classifyFixture(join(SPAM_DIRECTORY, name))

      expect(result).toEqual(expect.objectContaining({ isSpam: true }))
    })

    it('should keep the zero-width-broken recipient domains (AC-007)', async () => {
      const results = await Promise.all(spamFixtures.map((name) => classifyFixture(join(SPAM_DIRECTORY, name))))

      expect(results.filter(({ ruleIds }) => ruleIds.includes('zero-width-domain')).length).toBeGreaterThanOrEqual(4)
    })

    it.each(spamFixtures)('should carry no transport headers in %s', async (name) => {
      const parsed = await parseFixture(join(SPAM_DIRECTORY, name))

      expect(parsed.headerLines.map(({ key }) => key).filter((key) => TRANSPORT_HEADER.test(key))).toEqual([])
    })
  })

  describe('legitimate mail (AC-045)', () => {
    it.each(hamFixtures)('should not classify %s as spam at the default sensitivity', async (name) => {
      const result = await classifyFixture(join(HAM_DIRECTORY, name))

      expect(result).toEqual(expect.objectContaining({ isSpam: false }))
    })
  })

  describe('allow-list', () => {
    it.each(allFixtures)('should only contain example domains in %s', async (path) => {
      const texts = await fixtureTexts(path)
      const tokens = texts.flatMap(domainTokens).map((token) => token.toLowerCase())

      expect(tokens.length).toBeGreaterThan(0)
      expect(tokens.filter((token) => !ALLOWED_DOMAIN.test(token))).toEqual([])
    })

    it('should flag a domain outside the allow-list', () => {
      const tokens = domainTokens('Write to sales@acme-widgets.com or visit https://shop.acme.io/x and acme.co.uk')

      expect(tokens.filter((token) => !ALLOWED_DOMAIN.test(token.toLowerCase()))).toEqual(
        expect.arrayContaining(['acme-widgets.com', 'shop.acme.io', 'acme.co.uk']),
      )
    })
  })
})
