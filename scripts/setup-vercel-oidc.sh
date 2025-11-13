#!/bin/bash

# Setup Vercel OIDC for AWS authentication
# This script deploys the CloudFormation stack for Vercel OIDC integration

set -e

echo "🔐 Vercel OIDC Setup for Wraps"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
  echo "❌ AWS CLI not found. Please install it first."
  exit 1
fi

# Prompt for Vercel Team ID
echo "📋 Enter your Vercel Team ID (found in Team Settings):"
echo "   Example: team_xxxxxxxxxxxxx"
read -p "Team ID: " VERCEL_TEAM_ID

if [ -z "$VERCEL_TEAM_ID" ]; then
  echo "❌ Team ID is required"
  exit 1
fi

# Prompt for Vercel Project ID
echo ""
echo "📋 Enter your Vercel Project ID (found in Project Settings → General):"
echo "   Example: prj_xxxxxxxxxxxxx"
read -p "Project ID: " VERCEL_PROJECT_ID

if [ -z "$VERCEL_PROJECT_ID" ]; then
  echo "❌ Project ID is required"
  exit 1
fi

# Configuration
STACK_NAME="wraps-vercel-oidc"
TEMPLATE_FILE="cloudformation/vercel-oidc-role.yaml"
REGION="us-east-1"
AWS_PROFILE="${AWS_PROFILE:-wraps}"

echo ""
echo "📦 Configuration:"
echo "   Stack Name: ${STACK_NAME}"
echo "   Region: ${REGION}"
echo "   AWS Profile: ${AWS_PROFILE}"
echo "   Team ID: ${VERCEL_TEAM_ID}"
echo "   Project ID: ${VERCEL_PROJECT_ID}"
echo ""

read -p "Continue with deployment? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Deployment cancelled"
  exit 0
fi

# Check if stack already exists
if aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --profile ${AWS_PROFILE} &> /dev/null; then

  echo "⚠️  Stack ${STACK_NAME} already exists. Updating..."

  aws cloudformation update-stack \
    --stack-name ${STACK_NAME} \
    --template-body file://${TEMPLATE_FILE} \
    --parameters \
      ParameterKey=VercelTeamId,ParameterValue=${VERCEL_TEAM_ID} \
      ParameterKey=VercelProjectId,ParameterValue=${VERCEL_PROJECT_ID} \
    --capabilities CAPABILITY_NAMED_IAM \
    --region ${REGION} \
    --profile ${AWS_PROFILE}

  echo "⏳ Waiting for stack update to complete..."
  aws cloudformation wait stack-update-complete \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --profile ${AWS_PROFILE}
else
  echo "🚀 Creating CloudFormation stack..."

  aws cloudformation create-stack \
    --stack-name ${STACK_NAME} \
    --template-body file://${TEMPLATE_FILE} \
    --parameters \
      ParameterKey=VercelTeamId,ParameterValue=${VERCEL_TEAM_ID} \
      ParameterKey=VercelProjectId,ParameterValue=${VERCEL_PROJECT_ID} \
    --capabilities CAPABILITY_NAMED_IAM \
    --region ${REGION} \
    --profile ${AWS_PROFILE}

  echo "⏳ Waiting for stack creation to complete..."
  aws cloudformation wait stack-create-complete \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --profile ${AWS_PROFILE}
fi

echo ""
echo "✅ Stack deployed successfully!"
echo ""

# Get outputs
echo "📋 Stack Outputs:"
echo ""

ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --profile ${AWS_PROFILE} \
  --query 'Stacks[0].Outputs[?OutputKey==`BackendRoleArn`].OutputValue' \
  --output text)

OIDC_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --profile ${AWS_PROFILE} \
  --query 'Stacks[0].Outputs[?OutputKey==`OIDCProviderArn`].OutputValue' \
  --output text)

echo "   OIDC Provider ARN: ${OIDC_ARN}"
echo "   Backend Role ARN: ${ROLE_ARN}"
echo ""

echo "🔧 Next Steps:"
echo ""
echo "1. Add these environment variables to your Vercel project:"
echo ""
echo "   AWS_REGION=us-east-1"
echo "   AWS_ROLE_ARN=${ROLE_ARN}"
echo "   AWS_BACKEND_ACCOUNT_ID=905130073023"
echo ""
echo "2. Remove these environment variables from Vercel (if they exist):"
echo ""
echo "   AWS_ACCESS_KEY_ID"
echo "   AWS_SECRET_ACCESS_KEY"
echo "   AWS_PROFILE"
echo ""
echo "3. Redeploy your Vercel project"
echo ""
echo "📖 For more details, see: docs/VERCEL_OIDC_SETUP.md"
