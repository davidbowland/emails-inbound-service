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
const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g
// A digit run with phone separators, not glued to letters or hyphenated ids (PL-20261016-55810, a UUID's tail)
const PHONE_LIKE = /(?<![\p{L}\d-])\+?\d[\d \t().-]{8,40}\d(?![\p{L}\d-])/gu
// Synthetic numbers: (xxx) 555-01xx and the anonymizer's +1 555 010 0100, the AWS documentation account
// 123456789012, and zero-padded placeholder ids (0000000000001)
const SYNTHETIC_DIGITS = /^(?:1?(?:\d{3}55501\d{2}|5550\d{6})|123456789012|0{6,}\d{0,8})$/
const NAMED_ENTITIES: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' }

// Block tags become a space and inline tags are removed, so an inline tag splitting a domain (acme<b></b>.io) is seen
// whole. &amp; is decoded first, so a double-encoded "&amp;#46;" is scanned as "."; unknown named entities become a space
const BLOCK_TAG =
  /<\/?(?:address|blockquote|body|br|dd|div|dl|dt|h[1-6]|head|hr|html|li|ol|p|table|td|th|tr|ul)\b[^<>]*>/gi
const decodeHtml = (html: string): string =>
  html
    .replace(BLOCK_TAG, ' ')
    .replace(/<[^<>]*>/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d{1,7});/g, (_, digits: string) => String.fromCodePoint(Math.min(parseInt(digits, 10), 0x10ffff)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, digits: string) =>
      String.fromCodePoint(Math.min(parseInt(digits, 16), 0x10ffff)),
    )
    .replace(/&([a-z]{2,8});/gi, (_, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? ' ')

// The raw file plus every decoded part, each also with HTML entities decoded and tags stripped, with format characters
// removed so a zero-width-broken domain is seen whole
const fixtureTexts = async (path: string): Promise<string[]> => {
  const parsed = await parseFixture(path)
  return [
    readFileSync(path, 'utf8'),
    parsed.subject ?? '',
    parsed.text ?? '',
    typeof parsed.html === 'string' ? parsed.html : '',
    ...parsed.attachments.map((attachment) => attachment.content.toString('utf8')),
  ]
    .flatMap((text) => [text, decodeHtml(text)])
    .map((text) => text.replace(FORMAT_CHARACTERS, ''))
}

const domainTokens = (text: string): string[] => [
  ...Array.from(text.matchAll(EMAIL_DOMAIN), (match) => match[1]),
  ...Array.from(text.matchAll(URL_HOST), (match) => match[1]),
  // Addresses are removed first so a dotted local part (first.last@) is not read as a domain
  ...Array.from(text.replace(EMAIL_DOMAIN, ' ').matchAll(DOMAIN_LIKE), (match) => match[0]).filter(
    (token) => !FILE_EXTENSIONS.includes(token.split('.').pop()?.toLowerCase() ?? ''),
  ),
]

const ipv4Addresses = (text: string): string[] => Array.from(text.matchAll(IPV4), (match) => match[0])

const phoneLikeRuns = (text: string): string[] =>
  Array.from(text.matchAll(PHONE_LIKE), (match) => match[0]).filter((run) => {
    const digits = run.replace(/\D/g, '')
    return digits.length >= 10 && !SYNTHETIC_DIGITS.test(digits)
  })

// Each pitch's classification, pinned: any reweighting or pattern change that moves a score is a deliberate,
// visible edit here
const EXPECTED_PITCH_CLASSIFICATIONS: Record<string, { ruleIds: string[]; score: number }> = {
  'pitch-01.eml': { ruleIds: ['zero-width-domain', 'reply-opt-out', 'pitch-vocab'], score: 9 },
  'pitch-02.eml': { ruleIds: ['self-addressed', 'pitch-vocab'], score: 5 },
  'pitch-03.eml': { ruleIds: ['zero-width-domain', 'merge-tag', 'reply-opt-out', 'display-name-mismatch'], score: 13 },
  'pitch-04.eml': { ruleIds: ['reply-opt-out', 'pitch-vocab'], score: 5 },
  'pitch-05.eml': { ruleIds: ['merge-tag', 'reply-opt-out', 'display-name-mismatch'], score: 8 },
  'pitch-06.eml': { ruleIds: ['whatsapp', 'pitch-vocab'], score: 5 },
  'pitch-07.eml': { ruleIds: ['reply-opt-out', 'display-name-mismatch', 'pitch-vocab'], score: 7 },
  'pitch-08.eml': { ruleIds: ['zero-width-domain', 'reply-opt-out', 'display-name-mismatch'], score: 10 },
  'pitch-09.eml': { ruleIds: ['reply-opt-out', 'fake-reply', 'pitch-vocab'], score: 8 },
  'pitch-10.eml': { ruleIds: ['zero-width-domain', 'reply-opt-out', 'display-name-mismatch'], score: 10 },
  'pitch-11.eml': { ruleIds: ['merge-tag', 'whatsapp', 'pitch-vocab'], score: 7 },
  'pitch-12.eml': { ruleIds: ['reply-opt-out', 'display-name-mismatch'], score: 5 },
  'pitch-13.eml': { ruleIds: ['reply-opt-out', 'display-name-mismatch'], score: 5 },
  'pitch-14.eml': { ruleIds: ['zero-width-domain', 'reply-opt-out', 'pitch-vocab'], score: 11 },
  'pitch-15.eml': { ruleIds: ['fake-reply', 'pitch-vocab'], score: 5 },
  'pitch-16.eml': { ruleIds: ['reply-opt-out', 'whatsapp', 'pitch-vocab'], score: 9 },
}

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

      expect(spamFixtures.filter((_, index) => results[index].ruleIds.includes('zero-width-domain'))).toEqual([
        'pitch-01.eml',
        'pitch-03.eml',
        'pitch-08.eml',
        'pitch-10.eml',
        'pitch-14.eml',
      ])
    })

    it.each(spamFixtures)('should keep the pinned score and rules for %s', async (name) => {
      const result = await classifyFixture(join(SPAM_DIRECTORY, name))

      expect(result).toEqual({ isSpam: true, ...EXPECTED_PITCH_CLASSIFICATIONS[name] })
    })

    it('should pin a classification for every pitch', () => {
      expect(Object.keys(EXPECTED_PITCH_CLASSIFICATIONS).sort()).toEqual(spamFixtures)
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

    it.each(allFixtures)('should contain no IPv4 address in %s', async (path) => {
      const texts = await fixtureTexts(path)

      expect(texts.flatMap(ipv4Addresses)).toEqual([])
    })

    it.each(allFixtures)('should contain no phone-like digit run in %s', async (path) => {
      const texts = await fixtureTexts(path)

      expect(texts.flatMap(phoneLikeRuns)).toEqual([])
    })

    it('should flag a domain outside the allow-list', () => {
      const tokens = domainTokens('Write to sales@acme-widgets.com or visit https://shop.acme.io/x and acme.co.uk')

      expect(tokens.filter((token) => !ALLOWED_DOMAIN.test(token.toLowerCase()))).toEqual(
        expect.arrayContaining(['acme-widgets.com', 'shop.acme.io', 'acme.co.uk']),
      )
    })

    it('should flag a domain hidden by HTML entities or tags', () => {
      const tokens = domainTokens(
        decodeHtml('<p>Visit acme&#46;io, acme&#x2E;co, acme&amp;#46;biz or acme<b></b>.dev</p><p>&amp; more</p>'),
      )

      expect(tokens.filter((token) => !ALLOWED_DOMAIN.test(token.toLowerCase()))).toEqual(
        expect.arrayContaining(['acme.io', 'acme.co', 'acme.biz', 'acme.dev']),
      )
    })

    it('should flag an IPv4 address', () => {
      expect(ipv4Addresses('Server 203.0.113.42 answered; version 1.2.3 did not')).toEqual(['203.0.113.42'])
    })

    it('should flag a phone-like digit run but not a synthetic one', () => {
      expect(
        phoneLikeRuns(
          'Call +1 (415) 867-5309 or 0044 20 7946 1234, not (212) 555-0142, +1 555 010 0100, 123456789012, ' +
            '0000000000001, PX0000000000123456 or PL-20261016-55810',
        ),
      ).toEqual(['+1 (415) 867-5309', '0044 20 7946 1234'])
    })
  })
})
