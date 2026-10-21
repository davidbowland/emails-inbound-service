import { performance } from 'perf_hooks'

import event from '@events/receive-email.json'
import { ParsedMail, SESReceipt } from '@types'
import {
  classifyEmail,
  DEFAULT_SPAM_FILTER,
  MAX_SCORED_TEXT_LENGTH,
  SENSITIVITY_THRESHOLDS,
  SIGNAL_WEIGHTS,
  SpamFilter,
} from '@utils/spam-score'

const passReceipt = {
  ...event.Records[0].ses.receipt,
  dmarcVerdict: { status: 'PASS' },
} as unknown as SESReceipt
const envelopeSender = 'sender@example.org'
const recipientDomains = ['example.net']

const parsedMail = (overrides: Record<string, unknown> = {}): ParsedMail =>
  ({
    from: { html: '', text: '', value: [{ address: 'sender@example.org', name: 'Pat Sender' }] },
    headerLines: [{ key: 'from', line: 'From: Pat Sender <sender@example.org>' }],
    headers: new Map(),
    html: false,
    subject: 'Your order has shipped',
    text: 'Your package is on its way and should arrive Tuesday.',
    ...overrides,
  }) as unknown as ParsedMail

const receiptWith = (verdicts: Record<string, string>): SESReceipt =>
  ({
    ...passReceipt,
    ...Object.fromEntries(Object.entries(verdicts).map(([key, status]) => [key, { status }])),
  }) as unknown as SESReceipt

const settings = (overrides: Partial<SpamFilter> = {}): SpamFilter => ({ ...DEFAULT_SPAM_FILTER, ...overrides })

const replyToFrom = (address: string, name = '') => ({ html: '', text: '', value: [{ address, name }] })

const classifyBody = (text: string, filter: SpamFilter = DEFAULT_SPAM_FILTER) =>
  classifyEmail(parsedMail({ text }), passReceipt, envelopeSender, recipientDomains, filter)

const classifyParsed = (overrides: Record<string, unknown>, filter: SpamFilter = DEFAULT_SPAM_FILTER) =>
  classifyEmail(parsedMail(overrides), passReceipt, envelopeSender, recipientDomains, filter)

describe('spam-score', () => {
  describe('DEFAULT_SPAM_FILTER', () => {
    it('should default to medium sensitivity with no phrases or trusted senders', () => {
      expect(DEFAULT_SPAM_FILTER).toEqual({ blockPhrases: [], sensitivity: 'medium', trustedSenders: [] })
    })
  })

  describe('SENSITIVITY_THRESHOLDS', () => {
    it('should need the most evidence at low sensitivity and the least at high', () => {
      expect(SENSITIVITY_THRESHOLDS.low).toBeGreaterThan(SENSITIVITY_THRESHOLDS.medium)
      expect(SENSITIVITY_THRESHOLDS.medium).toBeGreaterThan(SENSITIVITY_THRESHOLDS.high)
    })
  })

  describe('classifyEmail', () => {
    describe('clean mail', () => {
      it('should score legitimate mail as not spam', () => {
        const result = classifyEmail(parsedMail(), passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER)

        expect(result).toEqual({ isSpam: false, ruleIds: [], score: 0 })
      })

      it('should tolerate a message with no subject, text, html or From', () => {
        const parsed = parsedMail({ from: undefined, html: false, subject: undefined, text: undefined })

        expect(classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER)).toEqual({
          isSpam: false,
          ruleIds: [],
          score: 0,
        })
      })
    })

    describe('SES verdict failure', () => {
      it.each(['spamVerdict', 'virusVerdict'])('should be spam when %s is FAIL', (verdict) => {
        const result = classifyEmail(
          parsedMail(),
          receiptWith({ [verdict]: 'FAIL' }),
          envelopeSender,
          recipientDomains,
          DEFAULT_SPAM_FILTER,
        )

        expect(result).toEqual({ isSpam: true, ruleIds: ['ses-fail'], score: 0 })
      })

      it('should not be overridden by trusted senders or low sensitivity', () => {
        const result = classifyEmail(
          parsedMail(),
          receiptWith({ spamVerdict: 'FAIL' }),
          envelopeSender,
          recipientDomains,
          settings({ sensitivity: 'low', trustedSenders: [envelopeSender] }),
        )

        expect(result).toEqual({ isSpam: true, ruleIds: ['ses-fail'], score: 0 })
      })
    })

    describe('trusted senders', () => {
      const spammy = parsedMail({ subject: 'Quick question', text: 'Hi {{First Name}}, reply with "NO" to stop.' })
      const blocking = settings({ blockPhrases: ['quick question'] })

      it('should trust a matching envelope sender with SPF PASS, ahead of block phrases', () => {
        const result = classifyEmail(spammy, passReceipt, envelopeSender, recipientDomains, {
          ...blocking,
          trustedSenders: ['@example.org'],
        })

        expect(result).toEqual({ isSpam: false, ruleIds: ['trusted'], score: 0 })
      })

      it('should trust a matching From address with DMARC PASS', () => {
        const result = classifyEmail(
          spammy,
          receiptWith({ spfVerdict: 'FAIL' }),
          'bounces@mailer.example.com',
          recipientDomains,
          { ...blocking, trustedSenders: ['sender@example.org'] },
        )

        expect(result).toEqual({ isSpam: false, ruleIds: ['trusted'], score: 0 })
      })

      it.each([
        [
          'duplicate From headers',
          {
            headerLines: [
              { key: 'from', line: 'From: Pat Sender <sender@example.org>' },
              { key: 'from', line: 'From: Mallory <mallory@campaign.example>' },
            ],
          },
        ],
        ['no From header line', { headerLines: [] }],
        ['missing header lines', { headerLines: undefined }],
        [
          'a multi-address From',
          {
            from: {
              html: '',
              text: '',
              value: [
                { address: 'sender@example.org', name: 'Pat Sender' },
                { address: 'mallory@campaign.example', name: 'Mallory' },
              ],
            },
          },
        ],
      ])('should not trust a matching From address with DMARC PASS given %s', (_, overrides) => {
        const result = classifyEmail(
          parsedMail({ subject: 'Quick question', ...overrides }),
          receiptWith({ spfVerdict: 'FAIL' }),
          'bounces@mailer.example.com',
          recipientDomains,
          { ...blocking, trustedSenders: ['sender@example.org'] },
        )

        expect(result.ruleIds).toEqual(['phrase'])
      })

      it('should still trust a matching envelope sender with SPF PASS given duplicate From headers', () => {
        const parsed = parsedMail({
          headerLines: [
            { key: 'from', line: 'From: Pat Sender <sender@example.org>' },
            { key: 'from', line: 'From: Mallory <mallory@campaign.example>' },
          ],
          subject: 'Quick question',
        })

        const result = classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, {
          ...blocking,
          trustedSenders: [envelopeSender],
        })

        expect(result.ruleIds).toEqual(['trusted'])
      })

      it('should cover subdomains with an @domain rule', () => {
        const result = classifyEmail(spammy, passReceipt, 'x@mail.example.org', recipientDomains, {
          ...blocking,
          trustedSenders: ['@example.org'],
        })

        expect(result.ruleIds).toEqual(['trusted'])
      })

      it('should not trust a matching envelope sender without SPF PASS', () => {
        const result = classifyEmail(
          spammy,
          receiptWith({ dmarcVerdict: 'FAIL', spfVerdict: 'GRAY' }),
          envelopeSender,
          recipientDomains,
          { ...blocking, trustedSenders: [envelopeSender] },
        )

        expect(result).toEqual({ isSpam: true, ruleIds: ['phrase'], score: 0 })
      })

      it('should not trust a matching From address without a DMARC verdict', () => {
        const receipt = { ...passReceipt, dmarcVerdict: undefined, spfVerdict: { status: 'FAIL' } }

        const result = classifyEmail(spammy, receipt as unknown as SESReceipt, envelopeSender, recipientDomains, {
          ...blocking,
          trustedSenders: ['sender@example.org'],
        })

        expect(result.ruleIds).toEqual(['phrase'])
      })

      it('should never trust a matching Reply-To', () => {
        const parsed = parsedMail({
          from: replyToFrom('stranger@campaign.example', 'Stranger'),
          replyTo: replyToFrom('friend@example.com'),
          subject: 'Quick question',
        })

        const result = classifyEmail(parsed, passReceipt, 'stranger@campaign.example', recipientDomains, {
          ...blocking,
          trustedSenders: ['friend@example.com'],
        })

        expect(result.ruleIds).toEqual(['phrase'])
      })

      it('should ignore non-string trusted senders and regex metacharacters', () => {
        const filter = { ...blocking, trustedSenders: [42, '(a+)+$', '.*', '*'] as unknown as string[] }

        expect(classifyEmail(spammy, passReceipt, envelopeSender, recipientDomains, filter).ruleIds).toEqual(['phrase'])
      })
    })

    describe('block phrases', () => {
      it('should be spam when the subject contains a block phrase', () => {
        const parsed = parsedMail({ subject: 'Rate: USD 12-hour' })

        const result = classifyEmail(
          parsed,
          passReceipt,
          envelopeSender,
          recipientDomains,
          settings({ blockPhrases: ['USD 12/hour'] }),
        )

        expect(result).toEqual({ isSpam: true, ruleIds: ['phrase'], score: 0 })
      })

      it('should be spam when the body contains a block phrase', () => {
        expect(
          classifyBody('Please reply with \u201CNO\u201D', settings({ blockPhrases: ['reply with "no"'] })),
        ).toEqual({ isSpam: true, ruleIds: ['phrase'], score: 0 })
      })

      it('should match whole words only', () => {
        expect(classifyBody('I am happy', settings({ blockPhrases: ['app'] })).ruleIds).toEqual([])
      })

      it('should not match a phrase across the subject and body', () => {
        const parsed = parsedMail({ subject: 'Hello', text: 'there friend' })

        expect(
          classifyEmail(
            parsed,
            passReceipt,
            envelopeSender,
            recipientDomains,
            settings({ blockPhrases: ['hello there'] }),
          ).ruleIds,
        ).toEqual([])
      })

      it('should be spam when only the html part contains a block phrase', () => {
        const result = classifyParsed(
          { html: '<p>Got a <b>quick question</b> for you</p>', text: 'Your package is on its way.' },
          settings({ blockPhrases: ['quick question'] }),
        )

        expect(result).toEqual({ isSpam: true, ruleIds: ['phrase'], score: 0 })
      })

      it('should not match a phrase across the text and html parts', () => {
        expect(
          classifyParsed({ html: '<p>friend</p>', text: 'Hello there' }, settings({ blockPhrases: ['there friend'] }))
            .ruleIds,
        ).toEqual([])
      })

      it('should match a phrase hidden with a soft hyphen', () => {
        expect(classifyBody('Message me on What\u00ADsApp', settings({ blockPhrases: ['whatsapp'] })).ruleIds).toEqual([
          'phrase',
        ])
      })

      it.each([
        ['text', { text: `${'x'.repeat(MAX_SCORED_TEXT_LENGTH)} quick question` }],
        ['html', { html: `<p>${'x'.repeat(MAX_SCORED_TEXT_LENGTH)} quick question</p>`, text: undefined }],
        // Stripping the tags would bring the phrase under 64 KB, so this only passes when the cap comes first
        ['tag-heavy html', { html: `${'<b></b>'.repeat(MAX_SCORED_TEXT_LENGTH / 7)} quick question`, text: '' }],
      ])('should not match a block phrase after the first 64 KB of the %s part', (_, body) => {
        expect(classifyParsed(body, settings({ blockPhrases: ['quick question'] })).ruleIds).toEqual([])
      })

      it('should ignore symbol-only and non-string entries', () => {
        const filter = settings({ blockPhrases: ['!!!', 7, null] as unknown as string[] })

        expect(classifyBody('!!! alert !!!', filter).ruleIds).toEqual([])
      })
    })

    describe('signals', () => {
      it.each([
        ['within the domain', 'Visit exa\u200Bmple.net today'],
        ['within the domain, mixed case', 'Visit EXA\u200C\u200DMPLE.NET today'],
        ['before the domain', 'Write to team@\u2060example.net'],
        ['after the domain', 'Write to team@example.net\uFEFF now'],
        ['between each letter', 'e\u200Bx\u200Ba\u200Bm\u200Bp\u200Bl\u200Be\u200B.\u200Bn\u200Be\u200Bt'],
      ])('should fire zero-width-domain for zero-width characters %s', (_, text) => {
        const result = classifyBody(text)

        expect(result.ruleIds).toEqual(['zero-width-domain'])
        expect(result.score).toBe(SIGNAL_WEIGHTS['zero-width-domain'])
      })

      it('should fire zero-width-domain for an html-only body using numeric entities', () => {
        const parsed = parsedMail({ html: '<p>Visit exa&#8203;mple.net or exa&#x200c;mple.net</p>', text: undefined })

        expect(
          classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER).ruleIds,
        ).toEqual(['zero-width-domain'])
      })

      it.each([
        ['away from any recipient domain', 'Hello\u200B there, visit example.net'],
        ['near another domain', 'Visit exa\u200Bmple.org'],
      ])('should not fire zero-width-domain for zero-width characters %s', (_, text) => {
        expect(classifyBody(text).ruleIds).toEqual([])
      })

      it('should not fire zero-width-domain without recipient domains', () => {
        const result = classifyEmail(
          parsedMail({ text: 'exa\u200Bmple.net' }),
          passReceipt,
          envelopeSender,
          ['', 3] as unknown as string[],
          DEFAULT_SPAM_FILTER,
        )

        expect(result.ruleIds).toEqual([])
      })

      it.each(['Hi {{First Name}},', 'Hi {{ first_name }},', 'Hi [First Name],', 'Hi %FIRSTNAME%,', 'Hi *|FNAME|*,'])(
        'should fire merge-tag for %p',
        (text) => {
          expect(classifyBody(text).ruleIds).toEqual(['merge-tag'])
        },
      )

      it.each([
        'Just reply with "NO" and I will stop.',
        'Reply \u201Cstop\u201D to opt out.',
        'Simply respond with NO.',
        'Reply with Wh\u200Bat\u200Bever? Reply with \u2018remove\u2019',
      ])('should fire reply-opt-out for %p', (text) => {
        expect(classifyBody(text).ruleIds).toEqual(['reply-opt-out'])
      })

      it('should not fire reply-opt-out for a no-reply notice', () => {
        expect(classifyBody('This is a no-reply address. Please do not reply.').ruleIds).toEqual([])
      })

      it.each([
        'Message me on WhatsApp: +1 (555) 010-0000',
        'Can you share your WhatsApp number?',
        'Drop me a line on Whats\u200BApp',
        'Drop me a line on Whats\u00ADApp',
        'What is your Whats App number',
      ])('should fire whatsapp for %p', (text) => {
        expect(classifyBody(text).ruleIds).toEqual(['whatsapp'])
      })

      it('should not fire whatsapp for a bare mention', () => {
        expect(classifyBody('We use WhatsApp for the family group.').ruleIds).toEqual([])
      })

      it('should fire display-name-mismatch when no display-name word is in the Reply-To local part', () => {
        const parsed = parsedMail({ replyTo: replyToFrom('mike.ops@campaign.example') })

        expect(
          classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER).ruleIds,
        ).toEqual(['display-name-mismatch'])
      })

      it.each([
        ['a display-name word appears in the local part', 'psender@example.org', 'Pat Sender'],
        ['the Reply-To is the From address', 'SENDER@example.org', 'Pat Sender'],
        ['the display name has no words', 'mike@campaign.example', '!!'],
        ['there is no display name', 'mike@campaign.example', ''],
      ])('should not fire display-name-mismatch when %s', (_, address, name) => {
        const parsed = parsedMail({
          from: replyToFrom('sender@example.org', name),
          replyTo: replyToFrom(address),
        })

        expect(
          classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER).ruleIds,
        ).toEqual([])
      })

      it('should only read the first 1 KB of the display name', () => {
        const parsed = parsedMail({
          from: replyToFrom('sender@example.org', `${'x'.repeat(1024)} Mike`),
          replyTo: replyToFrom('mike@campaign.example'),
        })

        expect(
          classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER).ruleIds,
        ).toEqual(['display-name-mismatch'])
      })

      it('should not fire display-name-mismatch without a Reply-To address', () => {
        const parsed = parsedMail({ replyTo: { html: '', text: '', value: [] } })

        expect(
          classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER).ruleIds,
        ).toEqual([])
      })

      it.each(['Re: our call', 'RE : our call', 'Reminder: invoice', '  re:follow up'])(
        'should fire fake-reply for subject %p without In-Reply-To',
        (subject) => {
          const parsed = parsedMail({ subject })

          expect(
            classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER).ruleIds,
          ).toEqual(['fake-reply'])
        },
      )

      it('should not fire fake-reply for a genuine reply', () => {
        const parsed = parsedMail({ inReplyTo: '<original@example.org>', subject: 'Re: dinner' })

        expect(
          classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER).ruleIds,
        ).toEqual([])
      })

      it('should not fire fake-reply for words starting with re', () => {
        const parsed = parsedMail({ subject: 'Receipt for your order' })

        expect(
          classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER).ruleIds,
        ).toEqual([])
      })

      it('should score pitch vocabulary per distinct phrase', () => {
        expect(classifyBody('We do SEO and web design.')).toEqual({ isSpam: false, ruleIds: ['pitch-vocab'], score: 2 })
      })

      it('should cap the pitch vocabulary score', () => {
        const result = classifyBody('SEO, web design, lead generation, app development and a free audit.')

        expect(result).toEqual({ isSpam: false, ruleIds: ['pitch-vocab'], score: 3 })
      })

      it('should count pitch vocabulary in the subject', () => {
        const parsed = parsedMail({ subject: 'Quick question' })

        expect(classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER)).toEqual({
          isSpam: false,
          ruleIds: ['pitch-vocab'],
          score: 1,
        })
      })

      it.each([
        ['spfVerdict', 'FAIL', 'spf-fail'],
        ['dkimVerdict', 'FAIL', 'dkim-fail'],
        ['dmarcVerdict', 'FAIL', 'dmarc-fail'],
        ['spamVerdict', 'GRAY', 'ses-gray'],
      ] as const)('should fire %s %s as %s', (verdict, status, ruleId) => {
        const result = classifyEmail(
          parsedMail(),
          receiptWith({ [verdict]: status }),
          envelopeSender,
          recipientDomains,
          DEFAULT_SPAM_FILTER,
        )

        expect(result).toEqual({ isSpam: false, ruleIds: [ruleId], score: SIGNAL_WEIGHTS[ruleId] })
      })

      it('should sum every fired signal', () => {
        const parsed = parsedMail({
          replyTo: replyToFrom('mike.ops@campaign.example'),
          subject: 'Re: quick question',
          text: 'Hi {{First Name}}, message me on WhatsApp: +1 555 010 0000. Reply "NO" to stop. team@exa\u200Bmple.net',
        })

        const result = classifyEmail(
          parsed,
          receiptWith({ dkimVerdict: 'FAIL', dmarcVerdict: 'FAIL', spamVerdict: 'GRAY', spfVerdict: 'FAIL' }),
          envelopeSender,
          recipientDomains,
          DEFAULT_SPAM_FILTER,
        )

        expect(result).toEqual({
          isSpam: true,
          ruleIds: [
            'zero-width-domain',
            'merge-tag',
            'reply-opt-out',
            'whatsapp',
            'display-name-mismatch',
            'fake-reply',
            'spf-fail',
            'dkim-fail',
            'dmarc-fail',
            'ses-gray',
            'pitch-vocab',
          ],
          score: 25,
        })
      })
    })

    describe('body text', () => {
      it('should score signals in the html part alongside the text part', () => {
        expect(classifyParsed({ html: '<p>Hi {{First Name}}</p>', text: 'Hello Pat' }).ruleIds).toEqual(['merge-tag'])
      })

      it('should not decode a double-encoded entity into a zero-width character', () => {
        expect(classifyParsed({ html: '<p>Visit exa&amp;#8203;mple.net</p>', text: undefined }).ruleIds).toEqual([])
      })

      it.each([
        ['a style block', '<style>p { content: "{{First Name}}" }</style><p>Hello</p>'],
        ['a script block', '<SCRIPT type="text/javascript">x = "{{First Name}}"</SCRIPT ><p>Hello</p>'],
        ['an unterminated script block', '<p>Hello</p><script>x = "{{First Name}}"'],
        ['a script block closed only by a later script end tag', '<script>a</style>{{First Name}}</script>Hello'],
      ])('should not score text inside %s', (_, html) => {
        expect(classifyParsed({ html, text: undefined }).ruleIds).toEqual([])
      })

      it('should score text after a style block and ignore stray closing tags', () => {
        expect(
          classifyParsed({ html: '</script><style>p {}</style><p>Hi {{First Name}}</p>', text: '' }).ruleIds,
        ).toEqual(['merge-tag'])
      })

      it('should strip tags and decode entities from an html-only body', () => {
        const parsed = parsedMail({
          html: '<p>Reply&nbsp;with &quot;NO&quot; &amp; <b>hi</b> &lt;{{First&#32;Name}}&gt; &#x110000;</p>',
          text: '',
        })

        expect(
          classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, DEFAULT_SPAM_FILTER).ruleIds,
        ).toEqual(['merge-tag', 'reply-opt-out'])
      })

      it.each([
        ['text', { text: `${'x'.repeat(MAX_SCORED_TEXT_LENGTH)} Hi {{First Name}}` }],
        ['html', { html: `${'x'.repeat(MAX_SCORED_TEXT_LENGTH)} Hi {{First Name}}`, text: undefined }],
      ])('should only score signals in the first 64 KB of the %s part', (_, body) => {
        expect(classifyParsed(body).ruleIds).toEqual([])
      })
    })

    describe('sensitivity', () => {
      // merge-tag (3) + spf-fail (1) = 4; + dkim-fail (1) = 5; + whatsapp (3) = 8
      const scored = (text: string, verdicts: Record<string, string>) => (sensitivity: SpamFilter['sensitivity']) =>
        classifyEmail(
          parsedMail({ text }),
          receiptWith(verdicts),
          envelopeSender,
          recipientDomains,
          settings({ sensitivity }),
        )

      it.each([
        ['high', true],
        ['medium', false],
        ['low', false],
      ] as const)('should classify a score of 4 at %s sensitivity as spam=%p', (sensitivity, isSpam) => {
        const result = scored('Hi {{First Name}}', { spfVerdict: 'FAIL' })(sensitivity)

        expect(result).toEqual({ isSpam, ruleIds: ['merge-tag', 'spf-fail'], score: 4 })
      })

      it.each([
        ['high', true],
        ['medium', true],
        ['low', false],
      ] as const)('should classify a score of 5 at %s sensitivity as spam=%p', (sensitivity, isSpam) => {
        expect(scored('Hi {{First Name}}', { dkimVerdict: 'FAIL', spfVerdict: 'FAIL' })(sensitivity).isSpam).toBe(
          isSpam,
        )
      })

      it('should classify a score of 8 at low sensitivity as spam', () => {
        const result = scored('Hi {{First Name}}, WhatsApp number?', { dkimVerdict: 'FAIL', spfVerdict: 'FAIL' })('low')

        expect(result).toEqual({ isSpam: true, ruleIds: ['merge-tag', 'whatsapp', 'spf-fail', 'dkim-fail'], score: 8 })
      })

      it('should fall back to medium for an unknown sensitivity or missing settings', () => {
        const parsed = parsedMail({ text: 'Hi {{First Name}}' })
        const receipt = receiptWith({ dkimVerdict: 'FAIL', spfVerdict: 'FAIL' })

        expect(
          classifyEmail(parsed, receipt, envelopeSender, recipientDomains, {
            sensitivity: 'extreme',
          } as unknown as SpamFilter),
        ).toEqual({ isSpam: true, ruleIds: ['merge-tag', 'spf-fail', 'dkim-fail'], score: 5 })
        expect(
          classifyEmail(parsed, receipt, envelopeSender, recipientDomains, undefined as unknown as SpamFilter).isSpam,
        ).toBe(true)
      })
    })

    describe('performance', () => {
      const megabyte = 1024 * 1024
      // Every hostile shape inside each 1 KB unit, so the 64 KB scored window still contains all of them
      const unit = [
        'exa\u200B'.repeat(16),
        '{{'.repeat(32),
        'whatsapp 1 '.repeat(8),
        'reply '.repeat(16),
        '<&#'.repeat(32),
        'a'.repeat(256),
      ].join('')
      const pathologicalText = unit.repeat(Math.ceil(megabyte / unit.length))
      const metacharacters = ['(a+)+$', '.*', '[a-z]+', '\\d{1,99}', '^$', '(?=a)', '|', '{{', '\\', '*|']
      const filter = settings({
        blockPhrases: Array.from({ length: 100 }, (_, index) => `${metacharacters[index % 10]} zz${index} (a+)+$`),
        sensitivity: 'low',
        trustedSenders: Array.from({ length: 100 }, (_, index) => `${metacharacters[index % 10]}@x${index}.example`),
      })

      it.each([
        ['text', { text: pathologicalText }],
        ['html', { html: pathologicalText, text: undefined }],
      ])('should classify a 1 MB pathological %s body against 100 entries quickly', (_, body) => {
        const parsed = parsedMail({ subject: '(a+)+$'.repeat(200), ...body })
        const run = () => classifyEmail(parsed, passReceipt, envelopeSender, recipientDomains, filter)
        const timed = (): number => {
          const start = performance.now()
          run()
          return performance.now() - start
        }
        // A loose guard only (correctness of the 64 KB cap is asserted deterministically above): warm the JIT once,
        // then take the best of three so a GC pause or a busy CI worker cannot fail the budget
        const result = run()
        const fastest = Math.min(timed(), timed(), timed())

        expect(result.ruleIds).not.toContain('phrase')
        expect(fastest).toBeLessThan(1000)
      })
    })
  })
})
