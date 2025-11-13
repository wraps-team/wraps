# Vercel OIDC Setup Guide

This guide walks you through setting up OpenID Connect (OIDC) federation between Vercel and AWS for secure, credential-free authentication.

## Why OIDC?

Instead of storing long-lived AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) in Vercel environment variables, OIDC allows Vercel to assume an IAM role using short-lived tokens. This is:

- ✅ **More Secure**: No long-lived credentials stored
- ✅ **Automatic Rotation**: Tokens expire and refresh automatically
- ✅ **Better Audit Trail**: CloudTrail shows which Vercel deployment assumed the role
- ✅ **Principle of Least Privilege**: Role can only be assumed by your specific Vercel project

## Prerequisites

- Wraps AWS account (905130073023)
- Vercel Team ID and Project ID
- AWS CLI configured with Wraps account credentials

## Step 1: Get Vercel IDs

### Get Team ID
1. Go to https://vercel.com/account
2. Click on your team settings
3. Copy the Team ID (format: `team_xxxxx`)

### Get Project ID
1. Go to your Vercel project settings
2. Navigate to "General" tab
3. Copy the Project ID (format: `prj_xxxxx`)

## Step 2: Deploy CloudFormation Stack

Deploy the OIDC provider and IAM role to your Wraps AWS account:

```bash
# Set your Vercel IDs
VERCEL_TEAM_ID="team_xxxxx"
VERCEL_PROJECT_ID="prj_xxxxx"

# Deploy the stack
AWS_PROFILE=wraps aws cloudformation create-stack \
  --stack-name wraps-vercel-oidc \
  --template-body file://cloudformation/vercel-oidc-role.yaml \
  --parameters \
    ParameterKey=VercelTeamId,ParameterValue=${VERCEL_TEAM_ID} \
    ParameterKey=VercelProjectId,ParameterValue=${VERCEL_PROJECT_ID} \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Wait for stack to complete
AWS_PROFILE=wraps aws cloudformation wait stack-create-complete \
  --stack-name wraps-vercel-oidc \
  --region us-east-1

echo "✅ Stack deployed successfully!"
```

## Step 3: Get the Role ARN

```bash
# Get the Role ARN from stack outputs
AWS_PROFILE=wraps aws cloudformation describe-stacks \
  --stack-name wraps-vercel-oidc \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`BackendRoleArn`].OutputValue' \
  --output text
```

The output will be something like:
```
arn:aws:iam::905130073023:role/wraps-vercel-backend-role
```

## Step 4: Configure Vercel Environment Variables

### Add OIDC Variables
Go to your Vercel project → Settings → Environment Variables and add:

```bash
# Production environment
AWS_REGION=us-east-1
AWS_ROLE_ARN=arn:aws:iam::905130073023:role/wraps-vercel-backend-role
AWS_BACKEND_ACCOUNT_ID=905130073023
```

### Remove Old Credentials (IMPORTANT!)
Delete these variables if they exist:
- ❌ `AWS_ACCESS_KEY_ID`
- ❌ `AWS_SECRET_ACCESS_KEY`
- ❌ `AWS_PROFILE` (only needed for local dev)

**Note:** Vercel automatically sets `AWS_WEB_IDENTITY_TOKEN_FILE` - don't set this manually.

## Step 5: Redeploy

Trigger a new deployment in Vercel:

```bash
# Push a commit or use Vercel CLI
vercel --prod
```

## How It Works

```
Vercel Deployment
    ↓
Request from Next.js API route
    ↓
AWS SDK reads AWS_ROLE_ARN env var
    ↓
AWS SDK reads AWS_WEB_IDENTITY_TOKEN_FILE (set by Vercel)
    ↓
Call STS AssumeRoleWithWebIdentity
    ↓
Vercel OIDC Provider validates token
    ↓
Check trust policy conditions:
  - aud = "vercel"
  - sub = "team:xxx:project:xxx:environment:production"
    ↓
Return temporary credentials (valid ~1 hour)
    ↓
Use credentials to assume customer roles
```

## Verification

After deployment, check that OIDC is working:

1. **Check Vercel Build Logs**:
   - Look for successful deployment
   - No AWS credential errors

2. **Test AWS Account Connection**:
   - Try connecting an AWS account in the dashboard
   - Should work without storing credentials in Vercel

3. **Check CloudTrail** (optional):
   ```bash
   AWS_PROFILE=wraps aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRoleWithWebIdentity \
     --region us-east-1 \
     --max-items 5
   ```

## Troubleshooting

### Error: "Not authorized to perform sts:AssumeRoleWithWebIdentity"

**Cause**: Trust policy doesn't match your Vercel team/project.

**Fix**: Verify the Team ID and Project ID in the CloudFormation parameters:
```bash
AWS_PROFILE=wraps aws cloudformation describe-stacks \
  --stack-name wraps-vercel-oidc \
  --region us-east-1 \
  --query 'Stacks[0].Parameters'
```

### Error: "Invalid identity token"

**Cause**: Vercel isn't providing the OIDC token.

**Fix**:
1. Ensure `AWS_ROLE_ARN` is set in Vercel
2. Ensure you removed `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
3. Redeploy the project

### Error: "Failed to assume role: No credentials returned"

**Cause**: AWS SDK can't find credentials.

**Fix**:
1. Check that `AWS_REGION` and `AWS_ROLE_ARN` are set in Vercel
2. Check CloudFormation stack is deployed successfully
3. Verify OIDC provider exists:
   ```bash
   AWS_PROFILE=wraps aws iam list-open-id-connect-providers
   ```

## Local Development

For local development, continue using AWS profiles (already configured):

```bash
# In .env.local
AWS_PROFILE=wraps
AWS_BACKEND_ACCOUNT_ID=905130073023
```

The code automatically handles both OIDC (production) and profiles (local dev).

## Security Best Practices

1. ✅ **Environment-Specific**: The trust policy only allows production deployments
2. ✅ **Project-Specific**: Only your Wraps project can assume the role
3. ✅ **Least Privilege**: Role only has `sts:AssumeRole` permission
4. ✅ **Short-Lived**: Tokens expire automatically (~1 hour)
5. ✅ **Auditable**: CloudTrail logs all role assumptions

## Cleanup (if needed)

To remove the OIDC setup:

```bash
AWS_PROFILE=wraps aws cloudformation delete-stack \
  --stack-name wraps-vercel-oidc \
  --region us-east-1
```

## Resources

- [Vercel OIDC Documentation](https://vercel.com/docs/security/secure-backend-access)
- [AWS OIDC Identity Providers](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [AWS STS AssumeRoleWithWebIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html)
