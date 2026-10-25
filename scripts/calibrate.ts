/*
 * Score one raw MIME message with the default spam filter (spec C-4b, AC-047).
 *
 *   export OWNER_DOMAINS=<owner domain>[,<owner domain>...]   # the recipient's own domains
 *   aws --profile claude-read-only s3 cp s3://emails-service-storage/received/<acct>/<id> - \
 *     | npx ts-node scripts/calibrate.ts
 *
 * Recipient domains come from the comma-separated OWNER_DOMAINS environment variable, or from arguments when given
 * (e.g. `example.net` to score a committed fixture); with neither, the script exits with a usage message, so no owner
 * identifier ever needs to live in this file.
 * The message is read from stdin and held in memory only. The output is a single JSON line,
 * {"isSpam":…,"score":…,"ruleIds":[…]}, and never any message content. SES verdicts are read from the
 * X-SES-*-Verdict and Authentication-Results headers SES adds to the stored message (PASS when absent), and the
 * envelope sender from Return-Path, so the classification matches what the inbound Lambda would compute.
 */
import { readFileSync } from 'fs'
import { simpleParser } from 'mailparser'

import { SESReceipt } from '../src/types'
import { classifyEmail, DEFAULT_SPAM_FILTER } from '../src/utils/spam-score'

const USAGE = 'Usage: OWNER_DOMAINS=<domain,...> calibrate.ts [recipient domain ...] < message.eml'

const listFromEnv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)

type Verdict = 'PASS' | 'FAIL' | 'GRAY' | 'PROCESSING_FAILED'

const headerValue = (headers: Map<string, unknown>, key: string): string => {
  const value = headers.get(key)
  return typeof value === 'string' ? value : ''
}

const toVerdict = (value: string | undefined): Verdict => {
  const upper = (value ?? '').toUpperCase()
  return upper === 'FAIL' || upper === 'GRAY' || upper === 'PROCESSING_FAILED' ? upper : 'PASS'
}

const authResult = (results: string, method: string): Verdict => {
  const result = results.match(new RegExp(`\\b${method}=([a-z]{1,16})`, 'i'))?.[1]?.toLowerCase()
  return result === 'fail' || result === 'softfail' || result === 'permerror' ? 'FAIL' : 'PASS'
}

const main = async (): Promise<void> => {
  const recipientDomains = process.argv.length > 2 ? process.argv.slice(2) : listFromEnv(process.env.OWNER_DOMAINS)
  if (recipientDomains.length === 0) {
    console.error(USAGE)
    process.exit(1)
  }
  const parsed = await simpleParser(readFileSync(0))
  const headers = parsed.headers as unknown as Map<string, unknown>
  const authenticationResults = parsed.headerLines
    .filter(({ key }) => key === 'authentication-results')
    .map(({ line }) => line)
    .join(' ')
  const receipt = {
    dkimVerdict: { status: authResult(authenticationResults, 'dkim') },
    dmarcVerdict: { status: authResult(authenticationResults, 'dmarc') },
    spamVerdict: { status: toVerdict(headerValue(headers, 'x-ses-spam-verdict')) },
    spfVerdict: { status: authResult(authenticationResults, 'spf') },
    virusVerdict: { status: toVerdict(headerValue(headers, 'x-ses-virus-verdict')) },
  } as unknown as SESReceipt
  const returnPath = headers.get('return-path') as { value?: { address?: string }[] } | undefined
  const envelopeSender = returnPath?.value?.[0]?.address ?? ''

  const { isSpam, ruleIds, score } = classifyEmail(
    parsed,
    receipt,
    envelopeSender,
    recipientDomains,
    DEFAULT_SPAM_FILTER,
  )
  console.log(JSON.stringify({ isSpam, ruleIds, score }))
}

main().catch(() => {
  console.log(JSON.stringify({ error: 'unparseable' }))
  process.exit(1)
})
