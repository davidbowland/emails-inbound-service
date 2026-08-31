# Lambdas for Emails Inbound Service

Lambda for inbound emails, which accepts emails from SES.

## Setup

The `developer` role is required to deploy this project.

### Node / NPM

1. [Node](https://nodejs.org/en/)
1. [NPM](https://www.npmjs.com/)

### AWS Credentials

To run locally, [AWS CLI](https://aws.amazon.com/cli/) is required in order to assume a role with permission to update resources. Install AWS CLI with:

```brew
brew install awscli
```

If file `~/.aws/credentials` does not exist, create it and add a default profile:

```toml
[default]
aws_access_key_id=<YOUR_ACCESS_KEY_ID>
aws_secret_access_key=<YOUR_SECRET_ACCESS_KEY>
region=us-east-1
```

If necessary, generate a [new access key ID and secret access key](https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html#access-keys-and-secret-access-keys).

Add a `developer` profile to the same credentials file:

```toml
[developer]
role_arn=arn:aws:iam::<account number>:role/developer
source_profile=default
mfa_serial=<YOUR_MFA_ARN>
region=us-east-1
```

If necessary, retrieve the ARN of the primary MFA device attached to the default profile:

```bash
aws iam list-mfa-devices --query 'MFADevices[].SerialNumber' --output text
```

### SSM Parameters

This service reads two API keys from SSM Parameter Store at runtime. **They must exist before the stack is first
deployed**, or the Lambda deploys successfully and then throws on its first invocation.

| Path                     | Test sibling                  | Type         | Authenticates calls to |
| ------------------------ | ----------------------------- | ------------ | ---------------------- |
| `/emails/emails-api-key` | `/emails-test/emails-api-key` | SecureString | `emails-email-api`     |
| `/emails/queue-api-key`  | `/emails-test/queue-api-key`  | SecureString | `emails-queue-api`     |

Both live under the shared `/emails/` prefix rather than a per-repo prefix because `/emails/queue-api-key` is a
single credential consumed by both this service and `emails-email-api`; a per-repo path would leave two places to
rotate. They are provisioned by `emails-email-api/scripts/putSsmParameters.sh`, which owns every shared `/emails/*`
path — do not add a second script here that writes the same values.

To write one by hand. SSM parameters are region-scoped, so it must be created in the region the stack deploys to:

```bash
aws ssm put-parameter --type SecureString --region us-east-1 \
  --name /emails/emails-api-key --value <THE_KEY> --overwrite
```

Because the parameters are `SecureString`, deploy-time `{{resolve:ssm:…}}` substitution is permanently unavailable —
the runtime read is mandatory, not a preference.

#### Rotation

Each value is memoized per warm Lambda container and the cache never expires, so rotate in this order:

1. Write the new value to SSM.
2. Force cold starts — a no-op deploy of this stack, or touching an environment variable on the function.
3. Retire the old credential.

Retiring the old value first leaves warm containers authenticating with a key that no longer works.

## Developing Locally

### Unit Tests

[Jest](https://jestjs.io/) tests are run automatically on commit and push. If the test coverage threshold is not met, the push will fail. See `jest.config.ts` for coverage threshold.

Manually run tests with:

```bash
npm run test
```

### Prettier / Linter

Both [Prettier](https://prettier.io/) and [ESLint](https://eslint.org/) are executed on commit. Manually prettify and lint code with:

```bash
npm run lint
```

### Deploying to Production

Deployment is handled by the GitHub Actions pipeline (`.github/workflows/pipeline.yaml`). On every push, unit tests run first. Pushes to `master` then `sam build` (esbuild, bundling the handler) and `sam package` the stack, deploy it to the testing account, and finally deploy the same packaged template to production. Feature branches instead build and deploy directly to the single shared `emails-inbound-service-test` stack (not a stack unique to the branch — concurrent feature branches overwrite whatever was deployed there previously). After a successful production deploy, a final job bumps the package version and pushes the tag.

To build and deploy manually (requires the `developer` role, see Setup above):

```bash
npm run deploy
```

## Additional Documentation

- [AWS Lambda](https://aws.amazon.com/lambda/)

- [ESLint](https://eslint.org/)

- [Jest](https://jestjs.io/)

- [Prettier](https://prettier.io/)
