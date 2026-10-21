/*
 * Anonymize one raw MIME message into a committable spam fixture (spec C-4a, decision D-23).
 *
 *   export OWNER_DOMAINS=<owner domain>[,<owner domain>...]   # the recipient's own domains
 *   export OWNER_NAMES=<first name>[,<nickname>...],<surname>  # the recipient's names, surname last
 *   aws --profile claude-read-only s3 cp s3://emails-service-storage/received/<acct>/<id> - \
 *     | npx ts-node scripts/anonymize-fixture.ts __tests__/fixtures/spam/pitch-NN.eml NN
 *
 * OWNER_DOMAINS and OWNER_NAMES are comma-separated and required; the script exits with a usage message when either
 * is unset, so no owner identifier ever needs to live in this file. Owner domains become example.net and owner names
 * before the last become "Alex" (the last, the surname, becomes "Example"). The Date header is truncated to the day.
 *
 * The raw message is read from stdin and only ever held in memory; the anonymized .eml is the only file written.
 * Output is a fresh, minimal message: a whitelist of headers (everything else, including Received, DKIM-Signature,
 * ARC-*, Return-Path, Authentication-Results, Message-ID, List-Unsubscribe and X-*, is dropped), a text/plain part and
 * an optional attribute-free text/html part, both 8-bit UTF-8. Attachments are dropped. Always review the output by
 * eye before committing it: names and company names inside the body can only be caught by a person.
 */
import { readFileSync, writeFileSync } from 'fs'
import { AddressObject, EmailAddress, simpleParser } from 'mailparser'

const USAGE =
  'Usage: OWNER_DOMAINS=<domain,...> OWNER_NAMES=<name,...> anonymize-fixture.ts <output.eml> <campaign number>'
const FAILURE = 'Anonymization failed'

const listFromEnv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)

const OWNER_DOMAINS = listFromEnv(process.env.OWNER_DOMAINS)
const OWNER_NAMES = listFromEnv(process.env.OWNER_NAMES)
if (OWNER_DOMAINS.length === 0 || OWNER_NAMES.length === 0) {
  console.error(USAGE)
  process.exit(1)
}
const OWNER_REPLACEMENT_DOMAIN = 'example.net'
const ROLE_LOCAL_PARTS = ['admin', 'contact', 'hello', 'info', 'sales', 'support', 'webmaster']
const ALLOWED_DOMAIN = /(?:^|\.)(?:example\.(?:com|net|org)|[a-z0-9-]+\.example)$/i

const INVENTED_FIRST_NAMES = ['Jordan', 'Casey', 'Riley', 'Morgan', 'Taylor', 'Jamie', 'Avery', 'Quinn']
const INVENTED_LAST_NAMES = ['Reyes', 'Patel', 'Novak', 'Okafor', 'Lindqvist', 'Moreau', 'Tanaka', 'Silva']
const GENERIC_LOCAL_PARTS = ['team', 'growth', 'studio', 'desk', 'office', 'outreach']

// U+200D sits last: between two other members it reads as a joined sequence (no-misleading-character-class)
const ZERO_WIDTH = '\u200B\u200C\u2060\uFEFF\u00AD\u200D'
const ZERO_WIDTH_CLASS = `[${ZERO_WIDTH}]`
const ZERO_WIDTH_ENTITY = /&(#(?:8203|8204|8205|8288|65279|173)|#x(?:200b|200c|200d|2060|feff|ad)|zwj|zwnj|shy);/gi
const ZERO_WIDTH_ENTITY_VALUES: Record<string, string> = {
  '#173': '\u00AD',
  '#65279': '\uFEFF',
  '#8203': '\u200B',
  '#8204': '\u200C',
  '#8205': '\u200D',
  '#8288': '\u2060',
  '#xad': '\u00AD',
  '#x200b': '\u200B',
  '#x200c': '\u200C',
  '#x200d': '\u200D',
  '#x2060': '\u2060',
  '#xfeff': '\uFEFF',
  shy: '\u00AD',
  zwj: '\u200D',
  zwnj: '\u200C',
}

const EMAIL_PATTERN = /[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,8}\.[a-z]{2,24}\b/gi
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'()[\]]{1,2048}/gi
const BARE_DOMAIN_PATTERN =
  /\b[a-z0-9](?:[a-z0-9-]{0,62})(?:\.[a-z0-9-]{1,63}){0,8}\.(?:com|net|org|io|co|us|uk|in|ai|app|dev|biz|info|agency|tech|digital|online|site|xyz|me|ca|au|de|pk|ph|bd|link|store|shop|pro|solutions|services|studio|marketing|media)\b/gi
const PHONE_PATTERN = /\+?\d[\d \t().-]{8,18}\d/g
const INVENTED_PHONE = '+1 555 010 0100'

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The last owner name (the surname) becomes "Example"; every earlier one (first names, nicknames) becomes "Alex"
const OWNER_NAME_REPLACEMENTS: [RegExp, string][] = OWNER_NAMES.map((name, index) => [
  new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegExp(name)}(?![\\p{L}\\p{M}])`, 'giu'),
  index === OWNER_NAMES.length - 1 && OWNER_NAMES.length > 1 ? 'Example' : 'Alex',
])

/* Recipient (owner) domains, including zero-width-broken forms */

// An owner domain with any run of zero-width characters between (or around) its characters
const ownerDomainPattern = (domain: string): RegExp =>
  new RegExp(
    domain
      .split('')
      .map((char) => char.replace(/[.]/g, '\\.'))
      .join(`${ZERO_WIDTH_CLASS}*`),
    'gi',
  )

// Keeps each zero-width run at the same label and offset (clamped) in the replacement domain
const replaceKeepingZeroWidth = (match: string, replacement: string): string => {
  const labels = replacement.split('.')
  const runs = Array.from(match.matchAll(new RegExp(`${ZERO_WIDTH_CLASS}+`, 'g'))).map((run) => {
    const before = match.slice(0, run.index).replace(new RegExp(ZERO_WIDTH_CLASS, 'g'), '')
    const labelIndex = Math.min(before.split('.').length - 1, labels.length - 1)
    const offset = Math.min(before.split('.').pop()?.length ?? 0, labels[labelIndex].length)
    return { labelIndex, offset, run: run[0] }
  })
  return labels
    .map((label, labelIndex) =>
      label
        .split('')
        .concat('')
        .map(
          (char, offset) =>
            runs
              .filter((run) => run.labelIndex === labelIndex && run.offset === offset)
              .map(({ run }) => run)
              .join('') + char,
        )
        .join(''),
    )
    .join('.')
}

const replaceOwnerDomains = (text: string): string =>
  OWNER_DOMAINS.reduce(
    (result, domain) =>
      result.replace(ownerDomainPattern(domain), (match) => replaceKeepingZeroWidth(match, OWNER_REPLACEMENT_DOMAIN)),
    text,
  )

/* Addresses */

interface AddressMap {
  addresses: Map<string, string>
  domains: Map<string, string>
}

const ownerLocalPart = (local: string): string =>
  ROLE_LOCAL_PARTS.includes(local.toLowerCase()) ? local.toLowerCase() : 'alex'

const domainOf = (address: string): string => address.split('@').pop()?.toLowerCase() ?? ''

const isOwnerDomain = (domain: string): boolean =>
  OWNER_DOMAINS.some((owner) => domain === owner || domain.endsWith(`.${owner}`))

const mapAddress = (address: string, addressMap: AddressMap): string => {
  const lower = address.toLowerCase()
  const known = addressMap.addresses.get(lower)
  if (known) {
    return known
  }
  const domain = domainOf(lower)
  if (isOwnerDomain(domain) || domain === OWNER_REPLACEMENT_DOMAIN) {
    return `${ownerLocalPart(lower.split('@')[0])}@${OWNER_REPLACEMENT_DOMAIN}`
  }
  return ALLOWED_DOMAIN.test(domain) ? lower : 'user@example.org'
}

/* Free text */

const tokensOf = (name: string): string[] =>
  name
    .split(/[^\p{L}\p{M}]+/u)
    .filter((token) => token.length >= 3)
    .filter((token) => !OWNER_NAMES.includes(token.toLowerCase()))

const replaceNameTokens = (text: string, nameTokens: Map<string, string>): string =>
  Array.from(nameTokens.entries()).reduce(
    (result, [original, invented]) =>
      result.replace(new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegExp(original)}(?![\\p{L}\\p{M}])`, 'giu'), invented),
    text,
  )

const isAllowedUrl = (url: string): boolean =>
  /^(?:https?:\/\/)?(?:www\.)?example\.(?:com|net|org)\/?$/i.test(url.replace(new RegExp(ZERO_WIDTH_CLASS, 'g'), ''))

const anonymizeText = (text: string, addressMap: AddressMap, nameTokens: Map<string, string>): string =>
  [
    (value: string) => replaceOwnerDomains(value),
    (value: string) => value.replace(EMAIL_PATTERN, (address) => mapAddress(address, addressMap)),
    (value: string) =>
      value.replace(URL_PATTERN, (url) => {
        const trailing = url.match(/[.,;:!?]+$/)?.[0] ?? ''
        const bare = url.slice(0, url.length - trailing.length)
        return (isAllowedUrl(bare) ? bare : 'https://example.com/') + trailing
      }),
    (value: string) =>
      value.replace(BARE_DOMAIN_PATTERN, (domain, offset: number, whole: string) =>
        whole[offset - 1] === '@' || ALLOWED_DOMAIN.test(domain) || whole.slice(offset - 8, offset) === 'https://'
          ? domain
          : 'example.com',
      ),
    (value: string) => replaceNameTokens(value, nameTokens),
    (value: string) =>
      OWNER_NAME_REPLACEMENTS.reduce((result, [pattern, name]) => result.replace(pattern, name), value),
    (value: string) =>
      value.replace(PHONE_PATTERN, (match) => ((match.match(/\d/g) ?? []).length >= 10 ? INVENTED_PHONE : match)),
  ].reduce((result, step) => step(result), text)

// Tags lose every attribute (links, images, tracking and styling all go); head, style, script and comments are dropped
const simplifyHtml = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(?:img|meta|link|o:p|v:[a-z]+|!doctype)[^>]*>/gi, '')
    .replace(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi, '<$1$2>')
    .replace(ZERO_WIDTH_ENTITY, (_, name: string) => ZERO_WIDTH_ENTITY_VALUES[name.toLowerCase()] ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()

/* Message */

const addressesOf = (field: AddressObject | AddressObject[] | undefined): EmailAddress[] =>
  (Array.isArray(field) ? field : field ? [field] : []).flatMap((object) => object.value)

const formatAddress = (name: string, address: string): string =>
  name ? `"${name.replace(/["\\]/g, '')}" <${address}>` : address

// Truncated to the day (00:00:00 UTC): the exact send time is not needed and could help identify the message
const toDayDate = (date: Date | undefined): string =>
  (date && !Number.isNaN(date.getTime()) ? date : new Date(0))
    .toUTCString()
    .replace(/\d{2}:\d{2}:\d{2} GMT$/, '00:00:00 +0000')

const main = async (): Promise<void> => {
  const [outputPath, campaignArg] = process.argv.slice(2)
  if (!outputPath || !/^\d{1,2}$/.test(campaignArg ?? '')) {
    console.error(USAGE)
    process.exit(1)
  }
  const campaign = campaignArg.padStart(2, '0')
  const seed = parseInt(campaign, 10)
  const parsed = await simpleParser(readFileSync(0))

  const senders = [...addressesOf(parsed.from), ...addressesOf(parsed.replyTo)].filter(
    (sender) => sender.address && !isOwnerDomain(domainOf(sender.address)),
  )
  const senderDomains = Array.from(new Set(senders.map((sender) => domainOf(sender.address as string))))
  const domains = new Map(
    senderDomains.map((domain, index) => [
      domain,
      `campaign-${campaign}${index === 0 ? '' : String.fromCharCode(97 + index)}.example`,
    ]),
  )

  const firstName = INVENTED_FIRST_NAMES[seed % INVENTED_FIRST_NAMES.length]
  const lastName = INVENTED_LAST_NAMES[(seed * 3) % INVENTED_LAST_NAMES.length]
  const senderNameTokens = Array.from(new Set(senders.flatMap((sender) => tokensOf(sender.name ?? ''))))
  const nameTokens = new Map(
    senderNameTokens.map((token, index) => [token, index === 0 ? firstName : index === 1 ? lastName : 'Studio']),
  )

  // A sender local part that carried the display name keeps carrying the invented one; any other becomes generic
  const inventLocalPart = (local: string, index: number): string => {
    const carriesName = senderNameTokens.some((token) => local.toLowerCase().includes(token.toLowerCase()))
    return carriesName ? firstName.toLowerCase() : GENERIC_LOCAL_PARTS[(seed + index) % GENERIC_LOCAL_PARTS.length]
  }
  const addresses = new Map(
    Array.from(new Set(senders.map((sender) => (sender.address as string).toLowerCase()))).map((address, index) => [
      address,
      `${inventLocalPart(address.split('@')[0], index)}@${domains.get(domainOf(address))}`,
    ]),
  )
  const addressMap: AddressMap = { addresses, domains }
  const text = (value: string): string => anonymizeText(value, addressMap, nameTokens)

  const formatSender = (sender: EmailAddress): string =>
    formatAddress(sender.name ? `${firstName} ${lastName}` : '', mapAddress(sender.address ?? '', addressMap))
  const formatRecipient = (recipient: EmailAddress): string =>
    formatAddress(recipient.name ? text(recipient.name) : '', mapAddress(recipient.address ?? '', addressMap))
  const references = (
    Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []
  )
    .slice(0, 5)
    .map((_, index) => `<ref-${campaign}-${index + 1}@campaign-${campaign}.example>`)

  const headers = [
    `From: ${addressesOf(parsed.from).map(formatSender).join(', ')}`,
    parsed.replyTo ? `Reply-To: ${addressesOf(parsed.replyTo).map(formatSender).join(', ')}` : '',
    `To: ${addressesOf(parsed.to).map(formatRecipient).join(', ') || 'alex@example.net'}`,
    parsed.cc ? `Cc: ${addressesOf(parsed.cc).map(formatRecipient).join(', ')}` : '',
    `Subject: ${text(parsed.subject ?? '').replace(/[\r\n]+/g, ' ')}`,
    `Date: ${toDayDate(parsed.date)}`,
    parsed.inReplyTo ? `In-Reply-To: <reply-${campaign}@campaign-${campaign}.example>` : '',
    references.length > 0 ? `References: ${references.join(' ')}` : '',
    'MIME-Version: 1.0',
  ].filter((header) => header.length > 0)

  const bodyText = text(parsed.text ?? '').trim()
  const bodyHtml = typeof parsed.html === 'string' ? text(simplifyHtml(parsed.html)) : ''
  const boundary = `fixture-${campaign}-boundary`
  const textPart = ['Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', bodyText]
  const message = bodyHtml
    ? [
        ...headers,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        ...textPart,
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        bodyHtml,
        `--${boundary}--`,
        '',
      ]
    : [...headers, ...textPart, '']

  writeFileSync(outputPath, message.join('\r\n'))
}

// A fixed string only: an error message could echo message content
main().catch(() => {
  console.error(FAILURE)
  process.exit(1)
})
