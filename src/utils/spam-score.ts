import type { ParsedMail, SESReceipt } from '../types'
import { matchesSenderRule } from './bounce'
import { createPhraseMatcher, toWords } from './phrase-matching'

// Declared here until the inbound flow (spec C-5) adds the shared type to types.ts. IN's types.ts re-exports the
// types-only aws-lambda package, so runtime constants such as DEFAULT_SPAM_FILTER live here, never there.
export type SpamSensitivity = 'low' | 'medium' | 'high'

export interface SpamFilter {
  blockPhrases: string[]
  sensitivity: SpamSensitivity
  trustedSenders: string[]
}

export interface SpamClassification {
  isSpam: boolean
  ruleIds: string[]
  score: number
}

export const DEFAULT_SPAM_FILTER: SpamFilter = { blockPhrases: [], sensitivity: 'medium', trustedSenders: [] }

// Spam when the weighted score reaches the threshold. Low sensitivity needs the most evidence (fewest catches).
export const SENSITIVITY_THRESHOLDS: Record<SpamSensitivity, number> = { high: 3, low: 8, medium: 5 }

export const SIGNAL_WEIGHTS = {
  'dkim-fail': 1,
  'display-name-mismatch': 2,
  'dmarc-fail': 2,
  'fake-reply': 2,
  'merge-tag': 3,
  'pitch-vocab': 1, // per distinct phrase, capped at MAX_PITCH_VOCAB_SCORE
  'reply-opt-out': 3,
  'ses-gray': 2,
  'spf-fail': 1,
  whatsapp: 3,
  'zero-width-domain': 5,
} as const

export type SignalId = keyof typeof SIGNAL_WEIGHTS

// ReDoS guard: everything scored is capped, and every pattern below is fixed with bounded quantifiers only.
export const MAX_SCORED_TEXT_LENGTH = 65_536
const MAX_HTML_LENGTH = 4 * MAX_SCORED_TEXT_LENGTH
const MAX_SUBJECT_LENGTH = 1_024
const MAX_PITCH_VOCAB_SCORE = 3

// U+200D sits last in the class: between two other members it reads as a joined sequence (no-misleading-character-class)
const ZERO_WIDTH_CHAR = /[\u200B\u200C\u2060\uFEFF\u200D]/g
const ZERO_WIDTH_RUN = /([\u200B\u200C\u2060\uFEFF\u200D]{1,64})/

const HTML_TAG = /<[^<>]{0,2048}>/g
const HTML_NAMED_ENTITY = /&(nbsp|amp|lt|gt|quot|apos|zwnj|zwj);/gi
const HTML_DECIMAL_ENTITY = /&#(\d{1,7});/g
const HTML_HEX_ENTITY = /&#x([0-9a-f]{1,6});/gi
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  zwj: '\u200D',
  zwnj: '\u200C',
}

const MERGE_TAG_PATTERNS: RegExp[] = [
  /\{\{[ \t]{0,3}[a-z][a-z0-9_. \t-]{0,40}\}\}/i,
  /\*\|[a-z_]{1,24}\|\*/i,
  /[[{%][ \t]{0,3}(?:first|last|full|company|business|contact)[ _-]{0,2}name[ \t]{0,3}[\]}%]/i,
]
const REPLY_OPT_OUT_PATTERN =
  /\b(?:reply|respond|write back)[ \t]{1,5}(?:with[ \t]{1,5})?["'\u2018\u2019\u201C\u201D]?(?:no|stop|remove|unsubscribe)\b/i
const WHATSAPP_PATTERNS: RegExp[] = [
  /\bwhats[ \t]{0,2}app\b[^\n]{0,80}?\+?\d[\d \t().-]{6,18}\d/i,
  /\bwhats[ \t]{0,2}app[ \t]{1,3}(?:number|no\b|contact)/i,
  /\b(?:your|share|send|drop|text|message)\b[^\n]{0,40}\bwhats[ \t]{0,2}app\b/i,
]
const FAKE_REPLY_SUBJECT = /^[ \t]{0,10}(?:re[ \t]{0,3}:|reminder\b)/i

const PITCH_VOCABULARY: string[][] = [
  'quick question',
  'quick call',
  'hop on a call',
  'jump on a call',
  'book a call',
  'schedule a call',
  '15 minutes',
  'free consultation',
  'free audit',
  'lead generation',
  'more leads',
  'more clients',
  'grow your business',
  'scale your business',
  'boost your',
  'seo',
  'first page of google',
  'rank higher',
  'web design',
  'website redesign',
  'app development',
  'virtual assistant',
  'outsourcing',
  'dedicated developer',
  'hourly rate',
  'per hour',
  'affordable rates',
  'case studies',
  'not interested',
  'just following up',
  'circle back',
  'partnership opportunity',
  'business proposal',
].map(toWords)

interface ScoringContext {
  matchesPhrase: (phraseWords: string[]) => boolean
  parsed: ParsedMail
  receipt: SESReceipt
  recipientDomains: string[]
  // NFKC-normalized subject and body with zero-width characters removed, for the fixed signal patterns
  signalText: string
  subject: string
  // Raw subject and body (zero-width characters intact), for the zero-width signal
  text: string
}

const decodeCodePoint = (value: number): string => (value <= 0x10ffff ? String.fromCodePoint(value) : ' ')

const htmlToText = (html: string): string =>
  html
    .slice(0, MAX_HTML_LENGTH)
    .replace(HTML_TAG, ' ')
    .replace(HTML_NAMED_ENTITY, (_, name: string) => NAMED_ENTITIES[name.toLowerCase()])
    .replace(HTML_DECIMAL_ENTITY, (_, digits: string) => decodeCodePoint(parseInt(digits, 10)))
    .replace(HTML_HEX_ENTITY, (_, digits: string) => decodeCodePoint(parseInt(digits, 16)))

const getBodyText = (parsed: ParsedMail): string => {
  const text = typeof parsed.text === 'string' && parsed.text.length > 0 ? parsed.text : undefined
  const html = typeof parsed.html === 'string' ? parsed.html : ''
  return (text ?? htmlToText(html)).slice(0, MAX_SCORED_TEXT_LENGTH)
}

const isString = (value: unknown): value is string => typeof value === 'string'

const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isString) : [])

const getThreshold = (sensitivity: unknown): number =>
  sensitivity === 'low' || sensitivity === 'high' ? SENSITIVITY_THRESHOLDS[sensitivity] : SENSITIVITY_THRESHOLDS.medium

/* Signals */

// A recipient domain broken by (or butting against) zero-width characters: `exa\u200Bmple.net`, `\u200Bexample.net`.
// Splitting on the runs yields the text with them stripped plus the offsets where each run sat; the signal fires when
// a domain occurrence in the stripped text spans or touches one of those offsets.
const hasZeroWidthDomain = ({ recipientDomains, text }: ScoringContext): boolean => {
  const domains = recipientDomains.filter((domain) => domain.length > 0).map((domain) => domain.toLowerCase())
  if (domains.length === 0) {
    return false
  }
  const segments = text
    .toLowerCase()
    .split(ZERO_WIDTH_RUN)
    .filter((_, index) => index % 2 === 0)
  const stripped = segments.join('')
  const touchesDomain = (boundary: number): boolean =>
    domains.some((domain) =>
      Array.from({ length: domain.length + 1 }, (_, offset) => boundary - offset).some(
        (start) => start >= 0 && stripped.startsWith(domain, start),
      ),
    )
  return segments.slice(0, -1).reduce(
    (state, segment) => {
      const boundary = state.offset + segment.length
      return { found: state.found || touchesDomain(boundary), offset: boundary }
    },
    { found: false, offset: 0 },
  ).found
}

const hasMergeTag = ({ signalText }: ScoringContext): boolean =>
  MERGE_TAG_PATTERNS.some((pattern) => pattern.test(signalText))

const hasReplyOptOut = ({ signalText }: ScoringContext): boolean => REPLY_OPT_OUT_PATTERN.test(signalText)

const hasWhatsAppAsk = ({ signalText }: ScoringContext): boolean =>
  WHATSAPP_PATTERNS.some((pattern) => pattern.test(signalText))

// The From display name claims a person or brand; none of its words appear in the Reply-To mailbox it routes to.
const hasDisplayNameMismatch = ({ parsed }: ScoringContext): boolean => {
  const from = parsed.from?.value?.[0]
  const replyTo = parsed.replyTo?.value?.[0]
  const fromAddress = (from?.address ?? '').toLowerCase()
  const replyToAddress = (replyTo?.address ?? '').toLowerCase()
  if (!from?.name || !replyToAddress || replyToAddress === fromAddress) {
    return false
  }
  const nameTokens = toWords(from.name).filter((token) => token.length >= 2)
  const replyToLocalPart = toWords(replyToAddress.split('@')[0]).join('')
  return nameTokens.length > 0 && nameTokens.every((token) => !replyToLocalPart.includes(token))
}

const hasFakeReply = ({ parsed, subject }: ScoringContext): boolean =>
  FAKE_REPLY_SUBJECT.test(subject) && !parsed.inReplyTo

const pitchVocabularyScore = ({ matchesPhrase }: ScoringContext): number => {
  const hits = PITCH_VOCABULARY.filter(matchesPhrase).length
  return Math.min(hits, MAX_PITCH_VOCAB_SCORE) * SIGNAL_WEIGHTS['pitch-vocab']
}

const SIGNALS: { fires: (context: ScoringContext) => boolean; id: SignalId }[] = [
  { fires: hasZeroWidthDomain, id: 'zero-width-domain' },
  { fires: hasMergeTag, id: 'merge-tag' },
  { fires: hasReplyOptOut, id: 'reply-opt-out' },
  { fires: hasWhatsAppAsk, id: 'whatsapp' },
  { fires: hasDisplayNameMismatch, id: 'display-name-mismatch' },
  { fires: hasFakeReply, id: 'fake-reply' },
  { fires: ({ receipt }) => receipt.spfVerdict?.status === 'FAIL', id: 'spf-fail' },
  { fires: ({ receipt }) => receipt.dkimVerdict?.status === 'FAIL', id: 'dkim-fail' },
  { fires: ({ receipt }) => receipt.dmarcVerdict?.status === 'FAIL', id: 'dmarc-fail' },
  { fires: ({ receipt }) => receipt.spamVerdict?.status === 'GRAY', id: 'ses-gray' },
]

const scoreSignals = (context: ScoringContext): { ruleIds: string[]; score: number } => {
  const fired = [
    ...SIGNALS.map(({ fires, id }) => ({ id, value: fires(context) ? SIGNAL_WEIGHTS[id] : 0 })),
    { id: 'pitch-vocab', value: pitchVocabularyScore(context) },
  ].filter(({ value }) => value > 0)
  return {
    ruleIds: fired.map(({ id }) => id),
    score: fired.reduce((total, { value }) => total + value, 0),
  }
}

/* Classification */

const isSesFail = (receipt: SESReceipt): boolean =>
  receipt.spamVerdict?.status === 'FAIL' || receipt.virusVerdict?.status === 'FAIL'

// Trust requires authentication: the envelope sender with SPF PASS, or the From address with DMARC PASS. Reply-To
// is forgeable and never consulted.
const isTrustedSender = (
  parsed: ParsedMail,
  receipt: SESReceipt,
  envelopeSender: string,
  trustedSenders: string[],
): boolean => {
  const fromAddress = parsed.from?.value?.[0]?.address
  const envelopeTrusted =
    receipt.spfVerdict?.status === 'PASS' &&
    isString(envelopeSender) &&
    trustedSenders.some((rule) => matchesSenderRule(envelopeSender, rule))
  const fromTrusted =
    receipt.dmarcVerdict?.status === 'PASS' &&
    isString(fromAddress) &&
    trustedSenders.some((rule) => matchesSenderRule(fromAddress, rule))
  return envelopeTrusted || fromTrusted
}

export const classifyEmail = (
  parsed: ParsedMail,
  receipt: SESReceipt,
  envelopeSender: string,
  recipientDomains: string[],
  settings: SpamFilter,
): SpamClassification => {
  if (isSesFail(receipt)) {
    return { isSpam: true, ruleIds: ['ses-fail'], score: 0 }
  }

  const trustedSenders = stringList(settings?.trustedSenders)
  if (isTrustedSender(parsed, receipt, envelopeSender, trustedSenders)) {
    return { isSpam: false, ruleIds: ['trusted'], score: 0 }
  }

  const subject = (isString(parsed.subject) ? parsed.subject : '').slice(0, MAX_SUBJECT_LENGTH)
  const body = getBodyText(parsed)
  // Subject and body are matched separately so a phrase never spans the two
  const matchesSubject = createPhraseMatcher(toWords(subject))
  const matchesBody = createPhraseMatcher(toWords(body))
  const matchesPhrase = (phraseWords: string[]): boolean => matchesSubject(phraseWords) || matchesBody(phraseWords)
  if (stringList(settings?.blockPhrases).map(toWords).some(matchesPhrase)) {
    return { isSpam: true, ruleIds: ['phrase'], score: 0 }
  }

  const text = `${subject}\n${body}`
  const { ruleIds, score } = scoreSignals({
    matchesPhrase,
    parsed,
    receipt,
    recipientDomains: stringList(recipientDomains),
    signalText: text.replace(ZERO_WIDTH_CHAR, '').normalize('NFKC'),
    subject,
    text,
  })
  return { isSpam: score >= getThreshold(settings?.sensitivity), ruleIds, score }
}
