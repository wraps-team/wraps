#!/bin/bash

# Verify the CloudFormation templates published to S3 match the copies in
# this repo. Customers consume the S3 copies directly
# (https://wraps-assets.s3.amazonaws.com/cloudformation/*.yaml), which are
# only updated by manually running scripts/upload-cloudformation-template.sh.
# This script catches drift between the repo and the last publish.
#
# No AWS credentials required: the bucket policy grants public s3:GetObject
# on the cloudformation/ prefix, so we fetch with plain curl.

set -e

BUCKET_URL="https://wraps-assets.s3.amazonaws.com"

# Keep this list in sync with the upload_template calls at the bottom of
# scripts/upload-cloudformation-template.sh.
TEMPLATES=(
  "cloudformation/wraps-console-access-role.yaml"
  "cloudformation/wraps-email-infrastructure.yaml"
)

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

status=0

for template in "${TEMPLATES[@]}"; do
  url="${BUCKET_URL}/${template}"
  tmp_file="${TMP_DIR}/$(basename "${template}")"

  if ! curl --fail --silent --show-error --location \
      --output "${tmp_file}" "${url}"; then
    echo "❌ FETCH FAILED: could not retrieve ${url}" >&2
    echo "   This is not drift — the published template could not be" >&2
    echo "   downloaded (network error or non-200 response). Do not run" >&2
    echo "   the upload script based on this failure alone; investigate" >&2
    echo "   the fetch first." >&2
    status=1
    continue
  fi

  if [ ! -s "${tmp_file}" ]; then
    echo "❌ FETCH FAILED: ${url} returned an empty body" >&2
    status=1
    continue
  fi

  if ! diff -u "${tmp_file}" "${template}" > "${TMP_DIR}/diff.txt"; then
    echo "❌ DRIFT DETECTED: ${template} does not match the published copy at ${url}" >&2
    echo "" >&2
    cat "${TMP_DIR}/diff.txt" >&2
    echo "" >&2
    echo "   To fix, publish the current repo copy:" >&2
    echo "     bash scripts/upload-cloudformation-template.sh" >&2
    status=1
    continue
  fi

  echo "✓ ${template} matches ${url}"
done

exit "${status}"
