import type { ParsedMail, SESReceipt, SpamFilter, SpamSensitivity } from '../types'
import { matchesSenderRule } from './bounce'
import { createPhraseMatcher, toWords } from './phrase-matching'

export interface SpamClassification {
  isSpam: boolean
  ruleIds: string[]
  score: number
}

// types.ts holds only types, so the runtime default for an account with no spamFilter lives here
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
  'self-addressed': 2,
  'ses-gray': 2,
  'spf-fail': 1,
  whatsapp: 3,
  'zero-width-domain': 5,
} as const

export type SignalId = keyof typeof SIGNAL_WEIGHTS

// ReDoS guard: every input is capped before any processing (AC-048), and every pattern below is fixed with bounded
// quantifiers only.
export const MAX_SCORED_TEXT_LENGTH = 65_536
const MAX_SUBJECT_LENGTH = 1_024
const MAX_DISPLAY_NAME_LENGTH = 1_024
const MAX_PITCH_VOCAB_SCORE = 3

const FORMAT_CHARACTERS = /\p{Cf}/gu
// U+200D sits last in the class: between two other members it reads as a joined sequence (no-misleading-character-class)
const ZERO_WIDTH_RUN = /([\u200B\u200C\u2060\uFEFF\u200D]{1,64})/

const HTML_TAG = /<[^<>]{0,2048}>/g
// Opening and closing <script>/<style> tags only; the blocks between them are cut by position, not by a regex
const HTML_HIDDEN_BLOCK_TAG = /<(\/?)(script|style)\b[^<>]{0,2048}>/gi
// &amp; is decoded last, on its own, so "&amp;#8203;" stays literal text instead of becoming a zero-width character
const HTML_NAMED_ENTITY = /&(nbsp|lt|gt|quot|apos|zwnj|zwj);/gi
const HTML_AMP_ENTITY = /&amp;/gi
const HTML_DECIMAL_ENTITY = /&#(\d{1,7});/g
const HTML_HEX_ENTITY = /&#x([0-9a-f]{1,6});/gi
const NAMED_ENTITIES: Record<string, string> = {
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
  // A merge tag filled with the raw address instead of a name: "Hi alex@example.net"
  /\b(?:hi|hello|hey|dear)[ \t,]{1,3}[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}\.[a-z]/i,
]
// A quote, then the word as a whole token (trailing punctuation allowed, as in \u201CNO.\u201D), then a closing quote
const quotedOptOut = (words: string): string =>
  `["'\u2018\u2019\u201C\u201D](?:${words})[.,!]{0,2}["'\u2018\u2019\u201C\u201D]`
// Phrasing that makes a quoted "no" an opt-out rather than an RSVP ("reply 'no' if you can't make it")
const NO_OPT_OUT_CONTEXT =
  "(?:\\bsubject\\b|(?:\\bnot|n['\u2019]t)[ \\t]{1,3}(?:to[ \\t]{1,3})?(?:hear|receive|be[ \\t]{1,3}contacted|interested|relevant|follow)\\b|\\bno[ \\t]{1,3}longer\\b|\\b(?:future|further)[ \\t]{1,3}emails\\b|\\bto[ \\t]{1,3}(?:stop|opt[ \\t-]{0,1}out|unsubscribe)\\b)"
const REPLY_VERB = '\\b(?:reply|respond|write back)\\b'
const REPLY_OPT_OUT_PATTERNS: RegExp[] = [
  /\b(?:reply|respond|write back)[ \t]{1,5}(?:with[ \t]{1,5})?(?:stop|remove|unsubscribe)\b/i,
  // "reply to this email with the subject line "REMOVE"": the opt-out word must be a whole quoted token
  new RegExp(`${REPLY_VERB}[^\\n]{0,60}?${quotedOptOut('stop|remove|unsubscribe')}`, 'i'),
  // A quoted "no" counts only beside opt-out phrasing on the same line, after it or before it
  new RegExp(`${REPLY_VERB}[^\\n]{0,60}?${quotedOptOut('no')}[^\\n]{0,60}?${NO_OPT_OUT_CONTEXT}`, 'i'),
  new RegExp(`${NO_OPT_OUT_CONTEXT}[^\\n]{0,80}?${REPLY_VERB}[^\\n]{0,60}?${quotedOptOut('no')}`, 'i'),
  // A fixed phrase, so a wrapped line inside it is allowed
  /\b(?:don['\u2019]?t|do not)\s{1,3}want\s{1,3}to\s{1,3}hear\s{1,3}from\s{1,3}(?:me|us)\b/i,
]
const WHATSAPP_PATTERNS: RegExp[] = [
  /\bwhats[ \t]{0,2}app\b[^\n]{0,80}?\+?\d[\d \t().-]{6,18}\d/i,
  /\bwhats[ \t]{0,2}app[ \t]{1,3}(?:number|no\b|contact)/i,
  /\b(?:your|share|send|drop|text|message)\b[^\n]{0,40}\bwhats[ \t]{0,2}app\b/i,
  /\bwhats[ \t]{0,2}app\b[^\n]{0,60}\b(?:share|send|drop)\b[^\n]{0,30}\bnumber\b/i,
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
  // Section 4 calibration (D-26): phrasing from the analyzed campaigns
  'mobile app',
  'your website',
  'your audience',
  'guest post',
  'work samples',
  'some samples',
  'samples and pricing',
  'affordable pricing',
  'competitive rates',
  'seo packages',
  'search engines',
  'search visibility',
  'targeted visitors',
  'india based',
].map(toWords)

interface ScoringContext {
  matchesPhrase: (phraseWords: string[]) => boolean
  parsed: ParsedMail
  receipt: SESReceipt
  recipientDomains: string[]
  // NFKC-normalized subject and body parts with format characters removed, for the fixed signal patterns
  signalText: string
  subject: string
  // Raw subject and body parts (zero-width characters intact), for the zero-width signal
  text: string
}

const decodeCodePoint = (value: number): string => (value <= 0x10ffff ? String.fromCodePoint(value) : ' ')

// One linear pass over the opening/closing tags: text inside <script> or <style> is dropped, as is everything after
// an unterminated one. A closing tag only ends the block it matches (</style> does not end a <script>).
const stripHiddenBlocks = (html: string): string => {
  const final = Array.from(html.matchAll(HTML_HIDDEN_BLOCK_TAG)).reduce(
    (state: { inside?: string; kept: string[]; keepFrom: number }, match) => {
      const [tag, closing, rawName] = match
      const name = rawName.toLowerCase()
      const index = Number(match.index)
      if (state.inside === undefined && !closing) {
        return { inside: name, kept: [...state.kept, html.slice(state.keepFrom, index)], keepFrom: index }
      }
      if (state.inside === name && closing) {
        return { inside: undefined, kept: state.kept, keepFrom: index + tag.length }
      }
      return state
    },
    { inside: undefined, kept: [], keepFrom: 0 },
  )
  const tail = final.inside === undefined ? [html.slice(final.keepFrom)] : []
  return [...final.kept, ...tail].join(' ')
}

const htmlToText = (html: string): string =>
  stripHiddenBlocks(html)
    .replace(HTML_TAG, ' ')
    .replace(HTML_NAMED_ENTITY, (_, name: string) => NAMED_ENTITIES[name.toLowerCase()])
    .replace(HTML_DECIMAL_ENTITY, (_, digits: string) => decodeCodePoint(parseInt(digits, 10)))
    .replace(HTML_HEX_ENTITY, (_, digits: string) => decodeCodePoint(parseInt(digits, 16)))
    .replace(HTML_AMP_ENTITY, '&')

const isString = (value: unknown): value is string => typeof value === 'string'

// The text part and the HTML part are both scored (AC-048): spam can hide in either. Each raw part is capped at 64 KB
// before any processing, and the HTML-derived text is capped again.
const getBodyParts = (parsed: ParsedMail): string[] => {
  const text = isString(parsed.text) ? parsed.text.slice(0, MAX_SCORED_TEXT_LENGTH) : ''
  const html = isString(parsed.html)
    ? htmlToText(parsed.html.slice(0, MAX_SCORED_TEXT_LENGTH)).slice(0, MAX_SCORED_TEXT_LENGTH)
    : ''
  return [text, html].filter((part) => part.length > 0)
}

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

const hasReplyOptOut = ({ signalText }: ScoringContext): boolean =>
  REPLY_OPT_OUT_PATTERNS.some((pattern) => pattern.test(signalText))

const hasWhatsAppAsk = ({ signalText }: ScoringContext): boolean =>
  WHATSAPP_PATTERNS.some((pattern) => pattern.test(signalText))

// The From display name claims a person or brand; none of its words appear in the Reply-To mailbox it routes to.
const hasDisplayNameMismatch = ({ parsed }: ScoringContext): boolean => {
  const from = parsed.from?.value?.[0]
  const replyTo = parsed.replyTo?.value?.[0]
  const fromAddress = (from?.address ?? '').toLowerCase()
  const replyToAddress = (replyTo?.address ?? '').toLowerCase()
  const fromName = isString(from?.name) ? from.name.slice(0, MAX_DISPLAY_NAME_LENGTH) : ''
  if (!fromName || !replyToAddress || replyToAddress === fromAddress) {
    return false
  }
  const nameTokens = toWords(fromName).filter((token) => token.length >= 2)
  const replyToLocalPart = toWords(replyToAddress.split('@')[0]).join('')
  return nameTokens.length > 0 && nameTokens.every((token) => !replyToLocalPart.includes(token))
}

const addressList = (field: unknown): string[] =>
  (Array.isArray(field) ? field : [field])
    .flatMap((group) => (Array.isArray(group?.value) ? group.value : []))
    .map((entry) => (isString(entry?.address) ? entry.address.toLowerCase() : ''))

// Sent To the sender's own address with the actual recipients hidden (Bcc), from outside the recipient domains: a
// bulk-mailing pattern. The owner mailing themselves is excluded.
const hasSelfAddressed = ({ parsed, recipientDomains }: ScoringContext): boolean => {
  const fromAddress = addressList(parsed.from)[0] ?? ''
  const fromDomain = fromAddress.split('@')[1] ?? ''
  const toAddresses = addressList(parsed.to)
  const ccAddresses = addressList(parsed.cc)
  return (
    fromAddress.length > 0 &&
    !recipientDomains.some((domain) => domain.toLowerCase() === fromDomain) &&
    toAddresses.length > 0 &&
    ccAddresses.length === 0 &&
    toAddresses.every((address) => address === fromAddress)
  )
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
  { fires: hasSelfAddressed, id: 'self-addressed' },
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

// DMARC aligns only one From, so From-based trust needs exactly one From header holding exactly one address; with
// duplicate From headers or a multi-address From, which address DMARC checked is ambiguous.
const getSingleFromAddress = (parsed: ParsedMail): string | undefined => {
  const fromHeaderCount = (Array.isArray(parsed.headerLines) ? parsed.headerLines : []).filter(
    (header) => header?.key === 'from',
  ).length
  const addresses = parsed.from?.value
  return fromHeaderCount === 1 && Array.isArray(addresses) && addresses.length === 1 ? addresses[0]?.address : undefined
}

// Trust requires authentication: the envelope sender with SPF PASS, or the single From address with DMARC PASS.
// Reply-To is forgeable and never consulted.
const isTrustedSender = (
  parsed: ParsedMail,
  receipt: SESReceipt,
  envelopeSender: string,
  trustedSenders: string[],
): boolean => {
  const fromAddress = getSingleFromAddress(parsed)
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
  const bodyParts = getBodyParts(parsed)
  // The subject and each body part are matched separately so a phrase never spans two of them
  const matchers = [subject, ...bodyParts].map((part) => createPhraseMatcher(toWords(part)))
  const matchesPhrase = (phraseWords: string[]): boolean => matchers.some((matches) => matches(phraseWords))
  if (stringList(settings?.blockPhrases).map(toWords).some(matchesPhrase)) {
    return { isSpam: true, ruleIds: ['phrase'], score: 0 }
  }

  // Blank lines between parts: no word, domain or single-line signal pattern can join across them
  const text = [subject, ...bodyParts].join('\n\n')
  const { ruleIds, score } = scoreSignals({
    matchesPhrase,
    parsed,
    receipt,
    recipientDomains: stringList(recipientDomains),
    signalText: text.normalize('NFKC').replace(FORMAT_CHARACTERS, ''),
    subject,
    text,
  })
  return { isSpam: score >= getThreshold(settings?.sensitivity), ruleIds, score }
}
