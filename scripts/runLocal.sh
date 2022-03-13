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

# Start the API locally

export ACCOUNT_API_KEY=$(aws apigateway get-api-key --api-key ypyhbxzdh4 --include-value --region us-east-1 | jq -r .value)
export ACCOUNT_API_URL=https://emails-account-api.bowland.link/v1
export EMAIL_BUCKET=emails-service-storage-test
export EMAIL_FROM=do-not-reply@bowland.link
export EMAIL_REGION=us-east-1
export QUEUE_API_KEY=$(aws apigateway get-api-key --api-key a6d57eyf98 --include-value --region us-east-1 | jq -r .value)
export QUEUE_API_URL=https://emails-queue-api.bowland.link/v1
sam local invoke --event events/receive-email.json --parameter-overrides "AccountApiKey=$ACCOUNT_API_KEY Environment=test QueueApiKey=$QUEUE_API_KEY"
