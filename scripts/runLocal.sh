#!/usr/bin/env bash

# Stop immediately on error
set -e

if [[ -z "$1" ]]; then
  $(./scripts/assumeDeveloperRole.sh)
fi

# Only install production modules
export HUSKY=0
export NODE_ENV=production

# Build the project
SAM_TEMPLATE=template.yaml
sam build --template ${SAM_TEMPLATE}

# Start the service locally
export EMAILS_API_URL=https://emails-email-api-internal.bowland.link/v1
export EMAIL_BUCKET=emails-service-storage-test
export EMAIL_FROM=do-not-reply@bowland.link
export EMAIL_REGION=us-east-1
export QUEUE_API_URL=https://emails-queue-api.bowland.link/v1
sam local invoke --event events/receive-email.json --parameter-overrides "Environment=test" --log-file local.log
