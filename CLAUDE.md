# Project Guidelines

**Always commit changes** after completing work unless explicitly told not to.

This service is part of the `emails` project. It processes inbound emails received via AWS SES: parses the raw
message, saves the contents to S3, looks up the recipient account via `emails-email-api`, records the received
email, and forwards attachments to `emails-queue-api` for outbound relay when configured. Infrastructure shared
across the `emails` project lives in a separate `emails-infrastructure` repo; most infrastructure here is
domain-specific to this service (SES receipt rule, Lambda, the shared storage bucket).

Use functional programming style where practical, including dependency injection, avoiding mutating objects or
values, etc.

## Code Layout

- **src/handlers** — entry points into the lambda, like controllers. Always catch exceptions and log with
  `logError`; never let exceptions bubble up from handlers.
- **src/services** — services that interact with outside resources (axios, the AWS SDK). Have side effects; only
  catch expected exceptions.
- **src/utils** — shared helper functions that are idempotent and have no side effects. Pure functions should not
  catch exceptions.
- **src/config.ts** — shared repository configuration. Environment variables should ALWAYS be read through config.
  `jest.setup-test-env.js` also needs to be updated when adding/changing environment variables.
- **src/types.ts** — all exported types or interfaces. Types only: re-exports use `export type`, and runtime values
  (such as `DEFAULT_SPAM_FILTER` in `src/utils/spam-score.ts`) live in utils or config, never here.
- **template.yaml** — infrastructure unique to this repository (SES receipt rule set, the Lambda function, the
  shared `EmailBucket`). See the file for the Lambda function definition that processes SES events.
- **.github/workflows/pipeline.yaml** — the GitHub Actions deployment pipeline for this repository.
- **events/\*.json** — example event payloads for each handler, used by tests.
- **\_\_tests\_\_/unit/\_\_mocks\_\_.ts** — mock data that is shared or too large to reasonably live in a test file
  (> 25 lines). Use typing where possible.
- **\_\_tests\_\_/unit/\*\*/\*** — test files for everything executable in src/, including `config.ts` now that it
  exports `assertRequiredEnv`. Only `types.ts` is untested, and it is excluded from coverage in `jest.config.ts`.
- **\_\_tests\_\_/tsconfig.json** — update `paths` here when adding a new directory within src/.
- **\_\_tests\_\_/fixtures/** — `spam/` and `ham/` MIME fixtures for the spam classifier. Real mail may be committed
  only after it is anonymized (`scripts/anonymize-fixture.ts`); every address and domain must be on the allow-list
  enforced by `__tests__/unit/utils/spam-fixtures.test.ts`. Never save an S3 object (inbound or received mail) to
  disk — read it in memory only.
- **\_\_tests\_\_/unit/phrase-matching-vectors.json** — phrase-matching test vectors shared with sibling repos (e.g.
  `emails-ui`) by identical copy, each copy pinning the same SHA-256 hash in its tests. Change every copy together
  and update every pinned hash; never reference another repo's copy by an on-disk path.
- **scripts/** — developer scripts: deployment helpers, `anonymize-fixture.ts` (reads one raw message from stdin in
  memory and writes only the anonymized fixture) and `calibrate.ts` (scores one message from stdin in memory, prints
  only the verdict, score and rule ids, and writes nothing to disk).

## Rules for Development

- Always analyze existing patterns in the file and repository and follow them exactly.
- Use arrow functions.
- All exported functions must specify explicit types for all inputs and return values.
- Imports from within the repository are relative (e.g. `../config`); the `@config`/`@events`/`@handlers`/
  `@services`/`@types`/`@utils` aliases only resolve under `__tests__/` (see `__tests__/tsconfig.json`).
- Never log PII — use sanitized identifiers, not raw email addresses (`log('Processing email', { messageId })`,
  not `{ email: 'user@domain.com' }`).
- Wrap AWS SDK clients with `xrayCapture` and call `xrayCaptureHttps()` before making traced outbound HTTP calls
  (axios).

## Testing Standards

**Jest clears all mocks automatically** (`clearMocks: true` in jest.config.ts). Never manually clear mocks.

**Mock state:** Set shared defaults in `beforeAll`. Override per-test with `mockReturnValueOnce` /
`mockResolvedValueOnce` / `mockRejectedValueOnce`. Never use `beforeEach`/`afterEach` — write a named `setup()`
function if repeated arrangement is needed and call it explicitly.

**Non-determinism:** Any function that uses `Date.now()`, `Math.random()`, or `crypto.randomUUID()` to produce a
value that affects test outcomes MUST accept it as an injectable parameter with a default:

```ts
// source
export const createThing = (input: Input, now = Date.now): Thing => ({ ...input, createdAt: now() })

// test
it('sets createdAt', () => {
  expect(createThing(input, () => 1_000_000).createdAt).toBe(1_000_000)
})
```

**Fake timers:** Use `jest.useFakeTimers()` in `beforeAll` (and `jest.useRealTimers()` in `afterAll`) when the code
under test calls `setTimeout`, `setInterval`, or `Date` internally without injection.

**No `if` statements in tests.** No live `Date.now()` or `Math.random()` calls in test bodies. No date arithmetic
that depends on the current wall-clock time. Never use `jest.spyOn` — use `jest.mocked` for type-safe mocking of
already-mocked modules instead. Every exported function is tested on its own with its own `describe` block. Every
SES/handler event should have a matching JSON fixture in `events/` (create one if missing).

**Deterministic above all.** A test that passes today and fails tomorrow is broken.

## Security

**API keys are the sole access control** for the outbound calls this service makes to `emails-email-api` and
`emails-queue-api` (`x-api-key` header). Both values are `SecureString` parameters in SSM Parameter Store, read at
runtime through `src/services/ssm.ts` and injected by an axios request interceptor — they are never CloudFormation
parameters, never GitHub secrets, and never logged. "Never logged" is enforced rather than merely intended: `log`,
`logWarn` and `logError` reduce an `AxiosError` to `{ message, status, url }` (`src/utils/logging.ts`), because a
rejected downstream call otherwise prints `config.headers` — `x-api-key` included — to CloudWatch. See the README
for the paths and the rotation procedure.

**Validate all external inputs.** Inbound SES payloads and the parsed MIME content are untrusted; validate shape
before acting on it or forwarding it downstream.

**OWASP Top 10.** Primary exposure for this Lambda: A01 Broken Access Control (API-key-as-sole-auth on the
downstream services it calls), A05 Security Misconfiguration (IAM — avoid `Resource: "*"`; the S3 policy already
scopes to the specific bucket ARN).
