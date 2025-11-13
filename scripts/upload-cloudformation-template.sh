#!/bin/bash

# Upload CloudFormation template to S3 for use in AWS Console
# This script uploads the template and makes it publicly readable

set -e

# Configuration
BUCKET_NAME="wraps-assets"
TEMPLATE_FILE="apps/web/public/cloudformation/wraps-console-access-role.yaml"
S3_KEY="cloudformation/wraps-console-access-role.yaml"
REGION="us-east-1"
BACKEND_ACCOUNT_ID="${AWS_BACKEND_ACCOUNT_ID:-905130073023}"

echo "📦 Uploading CloudFormation template to S3..."
echo "Bucket: s3://${BUCKET_NAME}"
echo "Key: ${S3_KEY}"
echo "Backend Account ID: ${BACKEND_ACCOUNT_ID}"
echo ""

# Check if bucket exists, create if it doesn't
if ! aws s3 ls "s3://${BUCKET_NAME}" --region ${REGION} 2>/dev/null; then
  echo "🪣 Creating S3 bucket: ${BUCKET_NAME}"
  aws s3 mb "s3://${BUCKET_NAME}" --region ${REGION}

  # Enable public access for template files
  echo "🔓 Configuring public access..."
  aws s3api put-public-access-block \
    --bucket ${BUCKET_NAME} \
    --public-access-block-configuration \
      "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
    --region ${REGION}
else
  echo "✓ Bucket ${BUCKET_NAME} already exists"
fi

# Update template with backend account ID
echo "📝 Updating template with backend account ID..."
TEMP_TEMPLATE=$(mktemp)
sed "s/Default: \"123456789012\"/Default: \"${BACKEND_ACCOUNT_ID}\"/" \
  "${TEMPLATE_FILE}" > "${TEMP_TEMPLATE}"

# Upload template (without ACL)
echo "⬆️  Uploading template..."
aws s3 cp "${TEMP_TEMPLATE}" \
  "s3://${BUCKET_NAME}/${S3_KEY}" \
  --content-type "text/yaml" \
  --region ${REGION}

# Create bucket policy for public read access
echo "🔓 Setting bucket policy for public read access..."
POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadCloudFormationTemplates",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/cloudformation/*"
    }
  ]
}
EOF
)

echo "${POLICY}" | aws s3api put-bucket-policy \
  --bucket ${BUCKET_NAME} \
  --policy file:///dev/stdin \
  --region ${REGION}

# Clean up
rm "${TEMP_TEMPLATE}"

# Get the public URL
TEMPLATE_URL="https://${BUCKET_NAME}.s3.amazonaws.com/${S3_KEY}"

echo ""
echo "✅ Template uploaded successfully!"
echo ""
echo "Template URL:"
echo "${TEMPLATE_URL}"
echo ""
echo "You can now update the form to use this URL, or test it in CloudFormation:"
echo "https://console.aws.amazon.com/cloudformation/home?region=${REGION}#/stacks/create/review?stackName=wraps-console-access&templateURL=${TEMPLATE_URL}"
