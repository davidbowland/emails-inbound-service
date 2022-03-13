#!/usr/bin/env bash

# Stop immediately on error
set -e

if [[ -z "$1" ]]; then
  $(./scripts/assumeDeveloperRole.sh)
fi

# Build from template

SAM_TEMPLATE=template.yaml
sam build --template ${SAM_TEMPLATE} --use-container

# Deploy build lambda

ACCOUNT_API_KEY=$(aws apigateway get-api-key --api-key ypyhbxzdh4 --include-value --region us-east-1 | jq -r .value)
QUEUE_API_KEY=$(aws apigateway get-api-key --api-key a6d57eyf98 --include-value --region us-east-1 | jq -r .value)
TESTING_ARTIFACTS_BUCKET=emails-lambda-test
TESTING_CLOUDFORMATION_EXECUTION_ROLE="arn:aws:iam::$AWS_ACCOUNT_ID:role/emails-cloudformation-test"
TESTING_STACK_NAME=emails-inbound-service-test
sam deploy --stack-name ${TESTING_STACK_NAME} \
           --capabilities CAPABILITY_IAM \
           --region us-east-1 \
           --s3-bucket ${TESTING_ARTIFACTS_BUCKET} \
           --s3-prefix emails-inbound-service-test \
           --no-fail-on-empty-changeset \
           --role-arn ${TESTING_CLOUDFORMATION_EXECUTION_ROLE} \
           --parameter-overrides "AccountApiKey=$ACCOUNT_API_KEY Environment=test QueueApiKey=$QUEUE_API_KEY"
