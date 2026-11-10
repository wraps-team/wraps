#!/usr/bin/env zsh
# Shared AWS CLI verification functions for deployment tests
# Source this file to use verify_base, verify_events, verify_smtp, verify_teardown

set -euo pipefail

# Colors
typeset -r GREEN='\033[0;32m'
typeset -r RED='\033[0;31m'
typeset -r YELLOW='\033[0;33m'
typeset -r CYAN='\033[0;36m'
typeset -r NC='\033[0m'

# Counters
typeset -i PASS_COUNT=0
typeset -i FAIL_COUNT=0

pass() {
  PASS_COUNT+=1
  printf "${GREEN}  PASS${NC} %s\n" "$1"
}

# Always returns 0. The detail line used to be a `[[ -n … ]] && printf`
# short-circuit, which made `fail` return 1 whenever it was called without a
# detail string — and under this file's `set -e` that aborted the whole run at
# the FIRST failed assertion instead of reporting the rest. Every new verifier
# would have had to re-discover that, so the guard lives here now.
fail() {
  FAIL_COUNT+=1
  printf "${RED}  FAIL${NC} %s\n" "$1"
  if [[ -n "${2:-}" ]]; then
    printf "       %s\n" "$2"
  fi
  return 0
}

section() {
  printf "\n${CYAN}--- %s ---${NC}\n" "$1"
}

summary() {
  printf "\n${CYAN}=== Results ===${NC}\n"
  printf "${GREEN}  Passed: %d${NC}\n" "$PASS_COUNT"
  if (( FAIL_COUNT > 0 )); then
    printf "${RED}  Failed: %d${NC}\n" "$FAIL_COUNT"
    return 1
  else
    printf "  All checks passed.\n"
    return 0
  fi
}

reset_counters() {
  PASS_COUNT=0
  FAIL_COUNT=0
}

# Helper: run AWS CLI command, capture stdout+stderr, return exit code
aws_check() {
  local output
  output=$(aws "$@" 2>&1) && echo "$output" && return 0 || return 1
}

# ─── Base Verification ───────────────────────────────────────────────

verify_base() {
  local domain="${1:?domain required}"
  local region="${2:-us-east-1}"
  local reputation_expected="${3:-true}"

  section "Base: IAM Role"

  local role_output
  if role_output=$(aws_check iam get-role --role-name wraps-email-role); then
    pass "IAM role wraps-email-role exists"

    # Check ManagedBy tag (value varies by method: wraps-cli, wraps-cdk, wraps-pulumi, wraps-cloudformation)
    local managed_by
    managed_by=$(echo "$role_output" | jq -r '.Role.Tags[] | select(.Key=="ManagedBy") | .Value // ""')
    if [[ "$managed_by" == wraps-* ]]; then
      pass "IAM role ManagedBy tag: $managed_by"
    elif [[ -n "$managed_by" ]]; then
      fail "IAM role ManagedBy tag unexpected value: $managed_by (expected wraps-*)"
    else
      fail "IAM role missing ManagedBy tag"
    fi

    # Check trust policy has sts:AssumeRoleWithWebIdentity (OIDC) or sts:AssumeRole
    if echo "$role_output" | jq -e '.Role.AssumeRolePolicyDocument.Statement[].Action' | grep -q 'AssumeRole'; then
      pass "IAM role trust policy allows AssumeRole"
    else
      fail "IAM role trust policy missing AssumeRole action"
    fi
  else
    fail "IAM role wraps-email-role not found" "$role_output"
  fi

  # Check inline policy (name varies: CLI uses wraps-email-policy, Pulumi auto-names)
  local policies_list
  if policies_list=$(aws_check iam list-role-policies --role-name wraps-email-role); then
    local policy_count
    policy_count=$(echo "$policies_list" | jq '.PolicyNames | length')
    if (( policy_count > 0 )); then
      local policy_name
      policy_name=$(echo "$policies_list" | jq -r '.PolicyNames[0]')
      pass "IAM inline policy exists: $policy_name"

      local policy_doc
      policy_doc=$(aws iam get-role-policy --role-name wraps-email-role --policy-name "$policy_name" 2>/dev/null)
      local policy_text
      policy_text=$(echo "$policy_doc" | jq -r '.PolicyDocument')

      # SES read permissions
      if echo "$policy_text" | grep -q 'ses:GetAccount'; then
        pass "IAM policy has ses:GetAccount"
      else
        fail "IAM policy missing ses:GetAccount"
      fi

      if echo "$policy_text" | grep -q 'ses:GetSendStatistics'; then
        pass "IAM policy has ses:GetSendStatistics"
      else
        fail "IAM policy missing ses:GetSendStatistics"
      fi

      # SES identity read permissions
      if echo "$policy_text" | grep -q 'ses:ListEmailIdentities'; then
        pass "IAM policy has ses:ListEmailIdentities"
      else
        fail "IAM policy missing ses:ListEmailIdentities"
      fi

      if echo "$policy_text" | grep -q 'ses:GetEmailIdentity'; then
        pass "IAM policy has ses:GetEmailIdentity"
      else
        fail "IAM policy missing ses:GetEmailIdentity"
      fi

      # SES send permissions
      if echo "$policy_text" | grep -q 'ses:SendEmail'; then
        pass "IAM policy has ses:SendEmail"
      else
        fail "IAM policy missing ses:SendEmail"
      fi

      if echo "$policy_text" | grep -q 'ses:SendRawEmail'; then
        pass "IAM policy has ses:SendRawEmail"
      else
        fail "IAM policy missing ses:SendRawEmail"
      fi
    else
      fail "IAM inline policy not found"
    fi
  else
    fail "Could not list IAM role policies" "$policies_list"
  fi

  section "Base: SES Configuration Set"

  # Derive config set name from the SES identity so this works for both
  # per-domain names (wraps-email-<slug>) and the legacy wraps-email-tracking name.
  local derived_config_set_name
  derived_config_set_name=$(aws sesv2 get-email-identity \
    --email-identity "$domain" \
    --region "$region" \
    --query 'ConfigurationSetName' \
    --output text 2>/dev/null)

  # Fall back to legacy name if identity doesn't exist yet or has no config set
  [[ -z "$derived_config_set_name" || "$derived_config_set_name" == "None" ]] && \
    derived_config_set_name="wraps-email-tracking"

  local ses_output
  if ses_output=$(aws_check sesv2 get-configuration-set \
    --configuration-set-name "$derived_config_set_name" \
    --region "$region"); then
    pass "SES config set $derived_config_set_name exists"

    # Check sending is enabled
    if echo "$ses_output" | jq -e '.SendingOptions.SendingEnabled == true' &>/dev/null; then
      pass "SES config set sending enabled"
    else
      fail "SES config set sending not enabled"
    fi

    # Check reputation metrics (starter preset disables this; production enables it)
    if [[ "$reputation_expected" == "true" ]]; then
      if echo "$ses_output" | jq -e '.ReputationOptions.ReputationMetricsEnabled == true' &>/dev/null; then
        pass "SES config set reputation metrics enabled"
      else
        fail "SES config set reputation metrics not enabled"
      fi
    else
      pass "SES config set reputation metrics not required (starter)"
    fi

    # Check suppression (BOUNCE and COMPLAINT)
    local suppressed_reasons
    suppressed_reasons=$(echo "$ses_output" | jq -r '[.SuppressionOptions.SuppressedReasons[]] | sort | join(",")' 2>/dev/null)
    if [[ "$suppressed_reasons" == *"BOUNCE"* && "$suppressed_reasons" == *"COMPLAINT"* ]]; then
      pass "SES config set suppression: $suppressed_reasons"
    else
      fail "SES config set missing suppression (BOUNCE/COMPLAINT), got: $suppressed_reasons"
    fi
  else
    fail "SES config set $derived_config_set_name not found" "$ses_output"
  fi

  section "Base: SES Domain Identity"

  local identity_output
  if identity_output=$(aws_check sesv2 get-email-identity \
    --email-identity "$domain" \
    --region "$region"); then
    pass "SES email identity $domain exists"

    # Check DKIM status
    local dkim_status
    dkim_status=$(echo "$identity_output" | jq -r '.DkimAttributes.Status // "NONE"')
    if [[ "$dkim_status" == "SUCCESS" || "$dkim_status" == "PENDING" ]]; then
      pass "SES DKIM status: $dkim_status"
    else
      fail "SES DKIM status unexpected: $dkim_status"
    fi

    # Check DKIM signing key length
    local dkim_key_length
    dkim_key_length=$(echo "$identity_output" | jq -r '.DkimAttributes.CurrentSigningKeyLength // .DkimAttributes.SigningAttributesOrigin // "NONE"')
    if [[ "$dkim_key_length" == "RSA_2048_BIT" || "$dkim_key_length" == "RSA_1024_BIT" ]]; then
      pass "SES DKIM key length: $dkim_key_length"
    else
      # Some API versions return this differently, just check DKIM tokens exist
      local token_count
      token_count=$(echo "$identity_output" | jq '[.DkimAttributes.Tokens // [] | length] | .[0]' 2>/dev/null)
      if (( token_count > 0 )); then
        pass "SES DKIM tokens present ($token_count)"
      else
        pass "SES DKIM configured (key length: $dkim_key_length)"
      fi
    fi

    # Check config set linkage (per-domain names like wraps-email-<slug> or legacy wraps-email-tracking)
    local linked_config
    linked_config=$(echo "$identity_output" | jq -r '.ConfigurationSetName // "NONE"')
    if [[ "$linked_config" == wraps-email-* ]]; then
      pass "SES identity linked to config set: $linked_config"
    else
      fail "SES identity config set: expected wraps-email-*, got $linked_config"
    fi

    # Check MAIL FROM domain (optional — not all presets/configs set it)
    local mail_from
    mail_from=$(echo "$identity_output" | jq -r '.MailFromAttributes.MailFromDomain // "NONE"')
    if [[ "$mail_from" == mail.* || "$mail_from" == *".${domain}" ]]; then
      pass "SES MAIL FROM domain: $mail_from"

      # Check MAIL FROM behavior on failure (only if MAIL FROM is configured)
      local mail_from_behavior
      mail_from_behavior=$(echo "$identity_output" | jq -r '.MailFromAttributes.BehaviorOnMxFailure // "NONE"')
      if [[ "$mail_from_behavior" == "USE_DEFAULT_VALUE" ]]; then
        pass "SES MAIL FROM fallback: USE_DEFAULT_VALUE"
      else
        fail "SES MAIL FROM fallback: expected USE_DEFAULT_VALUE, got $mail_from_behavior"
      fi
    else
      pass "SES MAIL FROM not configured (optional)"
    fi
  else
    fail "SES email identity $domain not found" "$identity_output"
  fi
}

# ─── IAM Policy Conditional Verification ─────────────────────────────

verify_iam_events_policy() {
  section "IAM: Conditional policy statements (events enabled)"

  # IAM is eventually consistent — retry policy read to avoid stale results after Pulumi update
  local policies_list policy_name policy_doc policy_text
  local max_attempts=3 attempt=0
  while (( attempt < max_attempts )); do
    if policies_list=$(aws_check iam list-role-policies --role-name wraps-email-role); then
      policy_name=$(echo "$policies_list" | jq -r '.PolicyNames[0]')
      policy_doc=$(aws iam get-role-policy --role-name wraps-email-role --policy-name "$policy_name" 2>/dev/null)
      policy_text=$(echo "$policy_doc" | jq -r '.PolicyDocument')
      if echo "$policy_text" | grep -q 'dynamodb:PutItem'; then
        break
      fi
    fi
    (( attempt++ ))
    if (( attempt < max_attempts )); then
      sleep 5
    fi
  done

  if [[ -z "${policies_list:-}" ]]; then
    fail "Could not list IAM role policies"
    return
  fi

  # DynamoDB access should be present when events.storeHistory is true
  if echo "$policy_text" | grep -q 'dynamodb:PutItem'; then
    pass "IAM policy has DynamoDB access (events.storeHistory)"
  else
    fail "IAM policy missing DynamoDB access"
  fi

  if echo "$policy_text" | grep -q 'dynamodb:Query'; then
    pass "IAM policy has dynamodb:Query"
  else
    fail "IAM policy missing dynamodb:Query"
  fi

  # EventBridge access should be present when events is configured
  if echo "$policy_text" | grep -q 'events:PutEvents'; then
    pass "IAM policy has events:PutEvents (events configured)"
  else
    fail "IAM policy missing events:PutEvents"
  fi

  # SQS access should be present when events is configured
  if echo "$policy_text" | grep -q 'sqs:SendMessage'; then
    pass "IAM policy has sqs:SendMessage (events configured)"
  else
    fail "IAM policy missing sqs:SendMessage"
  fi

  if echo "$policy_text" | grep -q 'sqs:ReceiveMessage'; then
    pass "IAM policy has sqs:ReceiveMessage (events configured)"
  else
    fail "IAM policy missing sqs:ReceiveMessage"
  fi
}

verify_iam_no_events_policy() {
  section "IAM: Verify no conditional statements (events disabled)"

  local policies_list
  if policies_list=$(aws_check iam list-role-policies --role-name wraps-email-role); then
    local policy_name
    policy_name=$(echo "$policies_list" | jq -r '.PolicyNames[0]')
    local policy_doc
    policy_doc=$(aws iam get-role-policy --role-name wraps-email-role --policy-name "$policy_name" 2>/dev/null)
    local policy_text
    policy_text=$(echo "$policy_doc" | jq -r '.PolicyDocument')

    # DynamoDB access should NOT be present without events
    if echo "$policy_text" | grep -q 'dynamodb:PutItem'; then
      fail "IAM policy has DynamoDB access but events not configured"
    else
      pass "No DynamoDB access (expected without events)"
    fi

    # EventBridge access should NOT be present without events
    if echo "$policy_text" | grep -q 'events:PutEvents'; then
      fail "IAM policy has events:PutEvents but events not configured"
    else
      pass "No EventBridge access (expected without events)"
    fi

    # SQS access should NOT be present without events
    if echo "$policy_text" | grep -q 'sqs:SendMessage'; then
      fail "IAM policy has sqs:SendMessage but events not configured"
    else
      pass "No SQS access (expected without events)"
    fi
  else
    fail "Could not list IAM role policies" "$policies_list"
  fi
}

# ─── Console Access Role Verification ─────────────────────────────────

verify_console_access_role() {
  section "Console Access Role"

  local role_output
  if role_output=$(aws_check iam get-role --role-name wraps-console-access-role); then
    pass "IAM role wraps-console-access-role exists"

    # Check trust policy allows Wraps Platform account with ExternalId
    if echo "$role_output" | jq -e '.Role.AssumeRolePolicyDocument.Statement[] | select(.Principal.AWS | tostring | contains("905130073023"))' &>/dev/null; then
      pass "Console role trusts Wraps Platform account 905130073023"
    else
      fail "Console role missing Wraps Platform trust"
    fi

    if echo "$role_output" | jq -e '.Role.AssumeRolePolicyDocument.Statement[] | select(.Condition.StringEquals["sts:ExternalId"])' &>/dev/null; then
      pass "Console role requires ExternalId condition"
    else
      fail "Console role missing ExternalId condition"
    fi
  else
    # Role is created by `wraps platform connect`, not by deploy commands.
    # Skip gracefully if not present — it's not a deployment requirement.
    pass "Console access role not present (created by platform connect)"
  fi
}

# ─── Events Verification ─────────────────────────────────────────────

verify_events() {
  local region="${1:-us-east-1}"
  local domain="${2:-}"

  # Derive config set name from the SES identity when domain is provided,
  # falling back to the legacy shared name for CDK/CFN/Pulumi callers.
  local events_config_set_name="wraps-email-tracking"
  if [[ -n "$domain" ]]; then
    local _cs
    _cs=$(aws sesv2 get-email-identity \
      --email-identity "$domain" \
      --region "$region" \
      --query 'ConfigurationSetName' \
      --output text 2>/dev/null)
    [[ -n "$_cs" && "$_cs" != "None" ]] && events_config_set_name="$_cs"
  fi

  section "Events: SES Event Destination"

  # Check that config set has an EventBridge event destination
  local event_dest_output
  if event_dest_output=$(aws_check sesv2 get-configuration-set-event-destinations \
    --configuration-set-name "$events_config_set_name" \
    --region "$region"); then
    local dest_count
    dest_count=$(echo "$event_dest_output" | jq '[.EventDestinations[]] | length')
    if (( dest_count > 0 )); then
      pass "SES config set has event destination(s): $dest_count"

      # Check for EventBridge destination
      if echo "$event_dest_output" | jq -e '.EventDestinations[] | select(.EventBridgeDestination != null)' &>/dev/null; then
        pass "SES event destination targets EventBridge"
      else
        fail "SES event destination not targeting EventBridge"
      fi

      # Check destination is enabled
      if echo "$event_dest_output" | jq -e '.EventDestinations[] | select(.Enabled == true)' &>/dev/null; then
        pass "SES event destination is enabled"
      else
        fail "SES event destination is disabled"
      fi

      # Check matching event types include critical ones
      local event_types
      event_types=$(echo "$event_dest_output" | jq -r '[.EventDestinations[0].MatchingEventTypes[]] | join(",")' 2>/dev/null)
      for evt in SEND DELIVERY BOUNCE COMPLAINT; do
        if [[ "$event_types" == *"$evt"* ]]; then
          pass "SES event destination captures $evt"
        else
          fail "SES event destination missing $evt event type"
        fi
      done
    else
      fail "SES config set has no event destinations"
    fi
  else
    fail "Could not get SES event destinations" "$event_dest_output"
  fi

  section "Events: DynamoDB Table"

  local table_output
  if table_output=$(aws_check dynamodb describe-table \
    --table-name wraps-email-history \
    --region "$region"); then
    pass "DynamoDB table wraps-email-history exists"

    # Billing mode
    local billing
    billing=$(echo "$table_output" | jq -r '.Table.BillingModeSummary.BillingMode // "PROVISIONED"')
    if [[ "$billing" == "PAY_PER_REQUEST" ]]; then
      pass "DynamoDB billing: PAY_PER_REQUEST"
    else
      fail "DynamoDB billing: expected PAY_PER_REQUEST, got $billing"
    fi

    # Key schema
    if echo "$table_output" | jq -e '.Table.KeySchema[] | select(.AttributeName=="messageId" and .KeyType=="HASH")' &>/dev/null; then
      pass "DynamoDB hash key: messageId"
    else
      fail "DynamoDB hash key not messageId"
    fi

    if echo "$table_output" | jq -e '.Table.KeySchema[] | select(.AttributeName=="sentAt" and .KeyType=="RANGE")' &>/dev/null; then
      pass "DynamoDB range key: sentAt"
    else
      fail "DynamoDB range key not sentAt"
    fi

    # TTL
    local ttl_output
    if ttl_output=$(aws_check dynamodb describe-time-to-live \
      --table-name wraps-email-history \
      --region "$region"); then
      local ttl_attr
      ttl_attr=$(echo "$ttl_output" | jq -r '.TimeToLiveDescription.AttributeName // "NONE"')
      if [[ "$ttl_attr" == "expiresAt" ]]; then
        pass "DynamoDB TTL on expiresAt"
      else
        fail "DynamoDB TTL attribute: expected expiresAt, got $ttl_attr"
      fi
    fi

    # GSI
    if echo "$table_output" | jq -e '.Table.GlobalSecondaryIndexes[] | select(.IndexName=="accountId-sentAt-index")' &>/dev/null; then
      pass "DynamoDB GSI accountId-sentAt-index exists"

      # GSI key schema
      if echo "$table_output" | jq -e '.Table.GlobalSecondaryIndexes[] | select(.IndexName=="accountId-sentAt-index") | .KeySchema[] | select(.AttributeName=="accountId" and .KeyType=="HASH")' &>/dev/null; then
        pass "DynamoDB GSI hash key: accountId"
      else
        fail "DynamoDB GSI hash key not accountId"
      fi

      if echo "$table_output" | jq -e '.Table.GlobalSecondaryIndexes[] | select(.IndexName=="accountId-sentAt-index") | .KeySchema[] | select(.AttributeName=="sentAt" and .KeyType=="RANGE")' &>/dev/null; then
        pass "DynamoDB GSI range key: sentAt"
      else
        fail "DynamoDB GSI range key not sentAt"
      fi

      # GSI projection
      local gsi_projection
      gsi_projection=$(echo "$table_output" | jq -r '.Table.GlobalSecondaryIndexes[] | select(.IndexName=="accountId-sentAt-index") | .Projection.ProjectionType')
      if [[ "$gsi_projection" == "ALL" ]]; then
        pass "DynamoDB GSI projection: ALL"
      else
        fail "DynamoDB GSI projection: expected ALL, got $gsi_projection"
      fi
    else
      fail "DynamoDB GSI accountId-sentAt-index not found"
    fi
  else
    fail "DynamoDB table wraps-email-history not found" "$table_output"
  fi

  section "Events: SQS Queues"

  # Main queue
  local queue_url
  if queue_url=$(aws sqs get-queue-url \
    --queue-name wraps-email-events \
    --region "$region" \
    --query 'QueueUrl' --output text 2>/dev/null); then
    pass "SQS queue wraps-email-events exists"

    local queue_attrs
    queue_attrs=$(aws sqs get-queue-attributes \
      --queue-url "$queue_url" \
      --attribute-names All \
      --region "$region" 2>/dev/null)

    # Visibility timeout (must be >= Lambda timeout, range 60-300)
    local vis_timeout
    vis_timeout=$(echo "$queue_attrs" | jq -r '.Attributes.VisibilityTimeout // "0"')
    if (( vis_timeout >= 60 && vis_timeout <= 300 )); then
      pass "SQS visibility timeout: ${vis_timeout}s"
    else
      fail "SQS visibility timeout: expected 60-300, got $vis_timeout"
    fi

    # Message retention (4 days)
    local retention
    retention=$(echo "$queue_attrs" | jq -r '.Attributes.MessageRetentionPeriod // "0"')
    if [[ "$retention" == "345600" ]]; then
      pass "SQS retention: 4 days (345600s)"
    else
      fail "SQS retention: expected 345600, got $retention"
    fi

    # Long polling
    local receive_wait
    receive_wait=$(echo "$queue_attrs" | jq -r '.Attributes.ReceiveMessageWaitTimeSeconds // "0"')
    if (( receive_wait >= 10 && receive_wait <= 20 )); then
      pass "SQS long polling: ${receive_wait}s"
    else
      fail "SQS long polling: expected 10-20, got $receive_wait"
    fi

    # Redrive policy: check DLQ target and maxReceiveCount
    local redrive_policy
    redrive_policy=$(echo "$queue_attrs" | jq -r '.Attributes.RedrivePolicy // ""')
    if echo "$redrive_policy" | grep -q 'wraps-email-events-dlq'; then
      pass "SQS redrive policy targets DLQ"
    else
      fail "SQS redrive policy not targeting DLQ"
    fi

    local max_receive
    max_receive=$(echo "$redrive_policy" | jq -r '.maxReceiveCount // 0' 2>/dev/null)
    if [[ "$max_receive" == "3" ]]; then
      pass "SQS redrive maxReceiveCount: 3"
    else
      fail "SQS redrive maxReceiveCount: expected 3, got $max_receive"
    fi
  else
    fail "SQS queue wraps-email-events not found"
  fi

  # DLQ
  local dlq_url
  if dlq_url=$(aws sqs get-queue-url \
    --queue-name wraps-email-events-dlq \
    --region "$region" \
    --query 'QueueUrl' --output text 2>/dev/null); then
    pass "SQS DLQ wraps-email-events-dlq exists"

    local dlq_attrs
    dlq_attrs=$(aws sqs get-queue-attributes \
      --queue-url "$dlq_url" \
      --attribute-names MessageRetentionPeriod \
      --region "$region" 2>/dev/null)

    local dlq_retention
    dlq_retention=$(echo "$dlq_attrs" | jq -r '.Attributes.MessageRetentionPeriod // "0"')
    if [[ "$dlq_retention" == "1209600" ]]; then
      pass "SQS DLQ retention: 14 days (1209600s)"
    else
      fail "SQS DLQ retention: expected 1209600, got $dlq_retention"
    fi
  else
    fail "SQS DLQ wraps-email-events-dlq not found"
  fi

  section "Events: Lambda Function"

  local lambda_output
  if lambda_output=$(aws_check lambda get-function \
    --function-name wraps-email-event-processor \
    --region "$region"); then
    pass "Lambda wraps-email-event-processor exists"

    # Runtime
    local runtime
    runtime=$(echo "$lambda_output" | jq -r '.Configuration.Runtime')
    if [[ "$runtime" == nodejs* ]]; then
      pass "Lambda runtime: $runtime"
    else
      fail "Lambda runtime: expected nodejs*, got $runtime"
    fi

    # Memory
    local memory
    memory=$(echo "$lambda_output" | jq -r '.Configuration.MemorySize')
    if [[ "$memory" == "512" ]]; then
      pass "Lambda memory: 512 MB"
    else
      fail "Lambda memory: expected 512, got $memory"
    fi

    # Timeout (30-300s, must be <= SQS visibility timeout)
    local timeout
    timeout=$(echo "$lambda_output" | jq -r '.Configuration.Timeout')
    if (( timeout >= 30 && timeout <= 300 )); then
      pass "Lambda timeout: ${timeout}s"
    else
      fail "Lambda timeout: expected 30-300, got $timeout"
    fi

    # Verify Lambda timeout <= SQS visibility timeout
    if (( timeout <= vis_timeout )); then
      pass "Lambda timeout ($timeout) <= SQS visibility ($vis_timeout)"
    else
      fail "Lambda timeout ($timeout) > SQS visibility ($vis_timeout) — will cause retries"
    fi

    # Handler
    local handler
    handler=$(echo "$lambda_output" | jq -r '.Configuration.Handler')
    if [[ "$handler" == "index.handler" ]]; then
      pass "Lambda handler: index.handler"
    else
      fail "Lambda handler: expected index.handler, got $handler"
    fi

    # Environment variables
    local env_vars
    env_vars=$(echo "$lambda_output" | jq -r '.Configuration.Environment.Variables // {}')

    if echo "$env_vars" | jq -e '.TABLE_NAME == "wraps-email-history"' &>/dev/null; then
      pass "Lambda TABLE_NAME = wraps-email-history"
    elif echo "$env_vars" | jq -e '.TABLE_NAME' &>/dev/null; then
      local table_val
      table_val=$(echo "$env_vars" | jq -r '.TABLE_NAME')
      fail "Lambda TABLE_NAME: expected wraps-email-history, got $table_val"
    else
      fail "Lambda missing TABLE_NAME env var"
    fi

    if echo "$env_vars" | jq -e '.AWS_ACCOUNT_ID' &>/dev/null; then
      pass "Lambda has AWS_ACCOUNT_ID env var"
    else
      fail "Lambda missing AWS_ACCOUNT_ID env var"
    fi

    if echo "$env_vars" | jq -e '.RETENTION_DAYS' &>/dev/null; then
      local ret_days
      ret_days=$(echo "$env_vars" | jq -r '.RETENTION_DAYS')
      pass "Lambda RETENTION_DAYS = $ret_days"
    else
      fail "Lambda missing RETENTION_DAYS env var"
    fi

    # Tags
    local lambda_tags
    lambda_tags=$(echo "$lambda_output" | jq -r '.Tags // {}')
    local lambda_managed_by
    lambda_managed_by=$(echo "$lambda_tags" | jq -r '.ManagedBy // ""')
    if [[ "$lambda_managed_by" == wraps-* ]]; then
      pass "Lambda ManagedBy tag: $lambda_managed_by"
    elif [[ -n "$lambda_managed_by" ]]; then
      fail "Lambda ManagedBy tag unexpected value: $lambda_managed_by (expected wraps-*)"
    else
      fail "Lambda missing ManagedBy tag"
    fi
  else
    fail "Lambda wraps-email-event-processor not found" "$lambda_output"
  fi

  # Lambda IAM role — discover from Lambda function's Role ARN
  section "Events: Lambda IAM Role"

  local lambda_role_name
  lambda_role_name=$(echo "$lambda_output" | jq -r '.Configuration.Role // ""' | sed 's|.*/||')
  if [[ -z "$lambda_role_name" ]]; then
    fail "Could not determine Lambda IAM role from function config"
  else
    local lambda_role_output
    if lambda_role_output=$(aws_check iam get-role --role-name "$lambda_role_name"); then
      pass "Lambda IAM role $lambda_role_name exists"

      # Trust policy allows lambda.amazonaws.com
      if echo "$lambda_role_output" | jq -e '.Role.AssumeRolePolicyDocument.Statement[] | select(.Principal.Service == "lambda.amazonaws.com")' &>/dev/null; then
        pass "Lambda role trusts lambda.amazonaws.com"
      else
        fail "Lambda role missing lambda.amazonaws.com trust"
      fi

      # Check attached managed policy (AWSLambdaBasicExecutionRole)
      local attached_policies
      attached_policies=$(aws iam list-attached-role-policies --role-name "$lambda_role_name" --query 'AttachedPolicies[].PolicyArn' --output json 2>/dev/null)
      if echo "$attached_policies" | grep -q 'AWSLambdaBasicExecutionRole'; then
        pass "Lambda role has AWSLambdaBasicExecutionRole"
      else
        fail "Lambda role missing AWSLambdaBasicExecutionRole"
      fi

      # Check inline policy has DynamoDB + SQS permissions
      local lambda_policies
      lambda_policies=$(aws iam list-role-policies --role-name "$lambda_role_name" --query 'PolicyNames' --output json 2>/dev/null)
      local lambda_policy_count
      lambda_policy_count=$(echo "$lambda_policies" | jq 'length')
      if (( lambda_policy_count > 0 )); then
        local lp_name
        lp_name=$(echo "$lambda_policies" | jq -r '.[0]')
        local lp_doc
        lp_doc=$(aws iam get-role-policy --role-name "$lambda_role_name" --policy-name "$lp_name" --query 'PolicyDocument' --output json 2>/dev/null)

        if echo "$lp_doc" | grep -q 'dynamodb:PutItem'; then
          pass "Lambda policy has DynamoDB write access"
        else
          fail "Lambda policy missing DynamoDB write access"
        fi

        if echo "$lp_doc" | grep -q 'sqs:ReceiveMessage'; then
          pass "Lambda policy has SQS read access"
        else
          fail "Lambda policy missing SQS read access"
        fi

        if echo "$lp_doc" | grep -q 'sqs:DeleteMessage'; then
          pass "Lambda policy has SQS delete access"
        else
          fail "Lambda policy missing SQS delete access"
        fi
      else
        fail "Lambda role has no inline policies"
      fi
    else
      fail "Lambda IAM role $lambda_role_name not found" "$lambda_role_output"
    fi
  fi

  # Event source mapping
  section "Events: Lambda Event Source Mapping"

  local esm_output
  if esm_output=$(aws_check lambda list-event-source-mappings \
    --function-name wraps-email-event-processor \
    --region "$region"); then
    local esm_count
    esm_count=$(echo "$esm_output" | jq '.EventSourceMappings | length')
    if (( esm_count > 0 )); then
      pass "Lambda has SQS event source mapping"

      local esm_first
      esm_first=$(echo "$esm_output" | jq '.EventSourceMappings[0]')

      # Batch size
      local batch_size
      batch_size=$(echo "$esm_first" | jq -r '.BatchSize')
      if [[ "$batch_size" == "10" ]]; then
        pass "Lambda ESM batch size: 10"
      else
        fail "Lambda ESM batch size: expected 10, got $batch_size"
      fi

      # Batching window
      local batch_window
      batch_window=$(echo "$esm_first" | jq -r '.MaximumBatchingWindowInSeconds // 0')
      if (( batch_window >= 0 && batch_window <= 10 )); then
        pass "Lambda ESM batching window: ${batch_window}s"
      else
        fail "Lambda ESM batching window: expected 0-10, got $batch_window"
      fi

      # ReportBatchItemFailures
      local response_types
      response_types=$(echo "$esm_first" | jq -r '[.FunctionResponseTypes // []] | .[0] | join(",")' 2>/dev/null)
      if [[ "$response_types" == *"ReportBatchItemFailures"* ]]; then
        pass "Lambda ESM reports batch item failures"
      else
        fail "Lambda ESM missing ReportBatchItemFailures"
      fi

      # Source ARN points to our queue
      local esm_source
      esm_source=$(echo "$esm_first" | jq -r '.EventSourceArn // ""')
      if [[ "$esm_source" == *"wraps-email-events"* ]]; then
        pass "Lambda ESM source: wraps-email-events queue"
      else
        fail "Lambda ESM source doesn't match wraps-email-events"
      fi
    else
      fail "Lambda has no event source mappings"
    fi
  fi

  section "Events: EventBridge Rule"

  local rule_output
  if rule_output=$(aws_check events describe-rule \
    --name wraps-email-events-to-sqs \
    --region "$region"); then
    pass "EventBridge rule wraps-email-events-to-sqs exists"

    # Event pattern
    local pattern
    pattern=$(echo "$rule_output" | jq -r '.EventPattern // ""')
    if echo "$pattern" | grep -q 'aws.ses'; then
      pass "EventBridge rule matches aws.ses events"
    else
      fail "EventBridge rule pattern doesn't match aws.ses"
    fi

    # Rule is enabled
    local rule_state
    rule_state=$(echo "$rule_output" | jq -r '.State // "DISABLED"')
    if [[ "$rule_state" == "ENABLED" ]]; then
      pass "EventBridge rule is ENABLED"
    else
      fail "EventBridge rule state: expected ENABLED, got $rule_state"
    fi

    # Check targets
    local targets_output
    targets_output=$(aws events list-targets-by-rule \
      --rule wraps-email-events-to-sqs \
      --region "$region" 2>/dev/null)
    local target_count
    target_count=$(echo "$targets_output" | jq '.Targets | length')
    if (( target_count > 0 )); then
      pass "EventBridge rule has $target_count target(s)"

      # At least one target points to SQS
      if echo "$targets_output" | jq -e '.Targets[] | select(.Arn | contains("sqs"))' &>/dev/null; then
        pass "EventBridge rule targets SQS queue"
      else
        fail "EventBridge rule has no SQS target"
      fi
    else
      fail "EventBridge rule has no targets"
    fi
  else
    fail "EventBridge rule wraps-email-events-to-sqs not found" "$rule_output"
  fi
}

# ─── SMTP Verification ───────────────────────────────────────────────

verify_smtp() {
  section "SMTP: IAM User"

  local user_output
  if user_output=$(aws_check iam get-user --user-name wraps-email-smtp-user); then
    pass "IAM user wraps-email-smtp-user exists"

    # Check tags
    local smtp_managed_by
    smtp_managed_by=$(echo "$user_output" | jq -r '.User.Tags[] | select(.Key=="ManagedBy") | .Value // ""')
    if [[ "$smtp_managed_by" == wraps-* ]]; then
      pass "IAM SMTP user ManagedBy tag: $smtp_managed_by"
    elif [[ -n "$smtp_managed_by" ]]; then
      fail "IAM SMTP user ManagedBy tag unexpected value: $smtp_managed_by (expected wraps-*)"
    else
      fail "IAM SMTP user missing ManagedBy tag"
    fi
  else
    fail "IAM user wraps-email-smtp-user not found" "$user_output"
  fi

  # Check inline policy
  local policies_output
  if policies_output=$(aws_check iam list-user-policies --user-name wraps-email-smtp-user); then
    local policy_count
    policy_count=$(echo "$policies_output" | jq '.PolicyNames | length')
    if (( policy_count > 0 )); then
      pass "IAM SMTP user has inline policy"

      local policy_name
      policy_name=$(echo "$policies_output" | jq -r '.PolicyNames[0]')
      local smtp_policy
      smtp_policy=$(aws iam get-user-policy \
        --user-name wraps-email-smtp-user \
        --policy-name "$policy_name" 2>/dev/null)
      if echo "$smtp_policy" | jq -r '.PolicyDocument' | grep -q 'ses:SendRawEmail'; then
        pass "SMTP policy has ses:SendRawEmail permission"
      else
        fail "SMTP policy missing ses:SendRawEmail permission"
      fi
    else
      fail "IAM SMTP user has no inline policies"
    fi
  else
    fail "Could not list SMTP user policies" "$policies_output"
  fi

  # Check access key exists
  local access_keys
  access_keys=$(aws iam list-access-keys --user-name wraps-email-smtp-user --query 'AccessKeyMetadata' --output json 2>/dev/null)
  local key_count
  key_count=$(echo "$access_keys" | jq 'length')
  if (( key_count > 0 )); then
    local key_status
    key_status=$(echo "$access_keys" | jq -r '.[0].Status')
    pass "SMTP access key exists (status: $key_status)"
  else
    fail "SMTP user has no access keys"
  fi
}

# ─── Webhook Verification ─────────────────────────────────────────────

verify_webhook() {
  local region="${1:-us-east-1}"

  section "Webhook: EventBridge Connection"

  local conn_output
  if conn_output=$(aws_check events describe-connection \
    --name wraps-webhook-connection \
    --region "$region"); then
    pass "EventBridge connection wraps-webhook-connection exists"

    local auth_type
    auth_type=$(echo "$conn_output" | jq -r '.AuthorizationType // "NONE"')
    if [[ "$auth_type" == "API_KEY" ]]; then
      pass "Connection auth type: API_KEY"
    else
      fail "Connection auth type: expected API_KEY, got $auth_type"
    fi

    local conn_state
    conn_state=$(echo "$conn_output" | jq -r '.ConnectionState // "UNKNOWN"')
    if [[ "$conn_state" == "AUTHORIZED" || "$conn_state" == "AUTHORIZING" || "$conn_state" == "CREATING" ]]; then
      pass "Connection state: $conn_state"
    else
      fail "Connection state: unexpected $conn_state"
    fi
  else
    fail "EventBridge connection wraps-webhook-connection not found" "$conn_output"
  fi

  section "Webhook: API Destination"

  local dest_output
  if dest_output=$(aws_check events describe-api-destination \
    --name wraps-webhook-destination \
    --region "$region"); then
    pass "API destination wraps-webhook-destination exists"

    local http_method
    http_method=$(echo "$dest_output" | jq -r '.HttpMethod // "NONE"')
    if [[ "$http_method" == "POST" ]]; then
      pass "API destination method: POST"
    else
      fail "API destination method: expected POST, got $http_method"
    fi

    local endpoint
    endpoint=$(echo "$dest_output" | jq -r '.InvocationEndpoint // ""')
    if [[ "$endpoint" == *"/webhooks/ses/"* ]]; then
      pass "API destination endpoint contains /webhooks/ses/"
    else
      fail "API destination endpoint doesn't match expected pattern: $endpoint"
    fi

    local rate_limit
    rate_limit=$(echo "$dest_output" | jq -r '.InvocationRateLimitPerSecond // 0')
    if (( rate_limit > 0 )); then
      pass "API destination rate limit: $rate_limit/s"
    else
      fail "API destination rate limit not set"
    fi
  else
    fail "API destination wraps-webhook-destination not found" "$dest_output"
  fi

  section "Webhook: EventBridge Rule Targets"

  # Check that the EventBridge rule has an API Destination target
  local targets_output
  targets_output=$(aws events list-targets-by-rule \
    --rule wraps-email-events-to-sqs \
    --region "$region" 2>/dev/null)
  local target_count
  target_count=$(echo "$targets_output" | jq '.Targets | length')
  if (( target_count >= 2 )); then
    pass "EventBridge rule has $target_count targets (SQS + webhook)"
  else
    fail "EventBridge rule has only $target_count target(s), expected >= 2"
  fi
}

# ─── Archiving Verification ──────────────────────────────────────────

verify_alerting() {
  local region="${1:-us-east-1}"
  local events_enabled="${2:-true}"

  section "Alerting Resources"

  # SNS topic
  local topic_arn
  topic_arn=$(aws sns list-topics --region "$region" --query "Topics[?ends_with(TopicArn, ':wraps-email-alerts')].TopicArn | [0]" --output text 2>/dev/null)
  if [[ "$topic_arn" != "None" && -n "$topic_arn" ]]; then
    pass "SNS topic wraps-email-alerts exists"
  else
    fail "SNS topic wraps-email-alerts not found"
  fi

  # CloudWatch alarms (all 4 created by alerting.ts)
  for alarm_name in wraps-email-bounce-rate-warning wraps-email-bounce-rate-critical wraps-email-complaint-rate-warning wraps-email-complaint-rate-critical; do
    if aws cloudwatch describe-alarms \
      --alarm-names "$alarm_name" \
      --region "$region" \
      --query 'MetricAlarms[0].AlarmName' --output text 2>/dev/null | grep -q "$alarm_name"; then
      pass "CloudWatch alarm $alarm_name exists"
    else
      fail "CloudWatch alarm $alarm_name not found"
    fi
  done

  # DLQ alarm only present when event tracking (SQS) is also deployed
  if [[ "$events_enabled" == "true" ]]; then
    if aws cloudwatch describe-alarms \
      --alarm-names wraps-email-dlq-messages \
      --region "$region" \
      --query 'MetricAlarms[0].AlarmName' --output text 2>/dev/null | grep -q 'wraps-email-dlq-messages'; then
      pass "CloudWatch alarm wraps-email-dlq-messages exists"
    else
      fail "CloudWatch alarm wraps-email-dlq-messages not found"
    fi
  fi
}

verify_archiving() {
  section "Email Archiving"

  local archive_output
  if archive_output=$(aws mailmanager list-archives --query "Archives[?ArchiveName=='wraps-email-archive']" --output json 2>/dev/null); then
    local archive_count
    archive_count=$(echo "$archive_output" | jq 'length')
    if (( archive_count > 0 )); then
      local archive_state
      archive_state=$(echo "$archive_output" | jq -r '.[0].ArchiveState // "UNKNOWN"')
      if [[ "$archive_state" == "ACTIVE" ]]; then
        pass "MailManager archive wraps-email-archive exists (ACTIVE)"
      else
        fail "MailManager archive wraps-email-archive state: $archive_state (expected ACTIVE)"
      fi
    else
      fail "MailManager archive wraps-email-archive not found"
    fi
  else
    fail "Could not list MailManager archives" "$archive_output"
  fi
}

# ─── Platform Role Permission Smoke Test ──────────────────────────────
#
# Creates a temporary IAM role with the same policy that platform connect
# would attach, assumes it, and verifies every AWS API call the platform
# actually makes succeeds with those credentials.
#
# Usage: verify_role_permissions <account_id> <region> <domain>

verify_role_permissions() {
  local account_id="${1:?account_id required}"
  local region="${2:?region required}"
  local domain="${3:?domain required}"

  # Derive actual config set name from the SES identity
  local role_config_set_name
  role_config_set_name=$(aws sesv2 get-email-identity \
    --email-identity "$domain" \
    --region "$region" \
    --query 'ConfigurationSetName' \
    --output text 2>/dev/null)
  [[ -z "$role_config_set_name" || "$role_config_set_name" == "None" ]] && \
    role_config_set_name="wraps-email-tracking"

  local test_role="wraps-test-role-permissions"
  local test_policy="wraps-test-policy"
  local test_external_id="wraps-deploy-test-$$"
  local session_name="wraps-permission-test"

  section "Platform role: Setup test role"

  # Build trust policy that allows the current account to assume
  local trust_policy
  trust_policy=$(cat <<TRUST
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::${account_id}:root" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "${test_external_id}" } }
  }]
}
TRUST
)

  # Build the same permission policy that platform connect creates
  # for a production email deployment with events + DynamoDB history
  local perm_policy
  perm_policy=$(cat <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:GetAccount",
        "ses:GetSendStatistics",
        "ses:ListIdentities",
        "ses:GetIdentityVerificationAttributes",
        "ses:ListEmailIdentities",
        "ses:GetEmailIdentity",
        "ses:GetConfigurationSet",
        "ses:GetConfigurationSetEventDestinations",
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:GetTemplate",
        "ses:ListTemplates",
        "ses:GetEmailTemplate",
        "ses:ListEmailTemplates",
        "ses:CreateEmailTemplate",
        "ses:UpdateEmailTemplate",
        "ses:DeleteEmailTemplate",
        "ses:TestRenderEmailTemplate"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:SendTemplatedEmail",
        "ses:SendBulkTemplatedEmail",
        "ses:SendBulkEmail"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:${account_id}:table/wraps-email-*",
        "arn:aws:dynamodb:*:${account_id}:table/wraps-email-*/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["events:PutEvents", "events:DescribeEventBus"],
      "Resource": "arn:aws:events:*:${account_id}:event-bus/wraps-email-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:*:${account_id}:wraps-email-*"
    }
  ]
}
POLICY
)

  # Create the test role
  if aws iam create-role \
    --role-name "$test_role" \
    --assume-role-policy-document "$trust_policy" \
    --tags '[{"Key":"ManagedBy","Value":"wraps-deploy-test"}]' \
    &>/dev/null; then
    pass "Created test role $test_role"
  else
    fail "Could not create test role"
    return 1
  fi

  # Attach the permission policy
  if aws iam put-role-policy \
    --role-name "$test_role" \
    --policy-name "$test_policy" \
    --policy-document "$perm_policy" \
    &>/dev/null; then
    pass "Attached permission policy"
  else
    fail "Could not attach permission policy"
    _cleanup_test_role "$test_role" "$test_policy"
    return 1
  fi

  # IAM role propagation delay — new roles need a few seconds before AssumeRole works
  printf "${CYAN}  Waiting for IAM role propagation...${NC}\n"
  sleep 10

  # AssumeRole
  local creds
  creds=$(aws sts assume-role \
    --role-arn "arn:aws:iam::${account_id}:role/${test_role}" \
    --role-session-name "$session_name" \
    --external-id "$test_external_id" \
    --duration-seconds 900 \
    --output json 2>&1)

  if [[ $? -ne 0 ]]; then
    fail "Could not AssumeRole" "$creds"
    _cleanup_test_role "$test_role" "$test_policy"
    return 1
  fi

  pass "AssumeRole succeeded"

  # Extract temporary credentials
  local ak sk st
  ak=$(echo "$creds" | jq -r '.Credentials.AccessKeyId')
  sk=$(echo "$creds" | jq -r '.Credentials.SecretAccessKey')
  st=$(echo "$creds" | jq -r '.Credentials.SessionToken')

  # Helper: run an AWS CLI call with assumed credentials
  _assumed() {
    AWS_ACCESS_KEY_ID="$ak" \
    AWS_SECRET_ACCESS_KEY="$sk" \
    AWS_SESSION_TOKEN="$st" \
    aws "$@" 2>&1
  }

  section "Platform role: SES read permissions"

  # ses:GetAccount
  if _assumed sesv2 get-account --region "$region" &>/dev/null; then
    pass "ses:GetAccount"
  else
    fail "ses:GetAccount — AccessDenied"
  fi

  # ses:GetEmailIdentity
  if _assumed sesv2 get-email-identity \
    --email-identity "$domain" --region "$region" &>/dev/null; then
    pass "ses:GetEmailIdentity"
  else
    fail "ses:GetEmailIdentity — AccessDenied"
  fi

  # ses:ListEmailIdentities
  if _assumed sesv2 list-email-identities --region "$region" &>/dev/null; then
    pass "ses:ListEmailIdentities"
  else
    fail "ses:ListEmailIdentities — AccessDenied"
  fi

  # ses:GetConfigurationSet
  if _assumed sesv2 get-configuration-set \
    --configuration-set-name "$role_config_set_name" --region "$region" &>/dev/null; then
    pass "ses:GetConfigurationSet"
  else
    fail "ses:GetConfigurationSet — AccessDenied"
  fi

  # ses:GetConfigurationSetEventDestinations
  if _assumed sesv2 get-configuration-set-event-destinations \
    --configuration-set-name "$role_config_set_name" --region "$region" &>/dev/null; then
    pass "ses:GetConfigurationSetEventDestinations"
  else
    fail "ses:GetConfigurationSetEventDestinations — AccessDenied"
  fi

  section "Platform role: SES send permissions"

  # ses:SendEmail via SES simulator
  if _assumed sesv2 send-email \
    --from-email-address "test@${domain}" \
    --destination '{"ToAddresses":["success@simulator.amazonses.com"]}' \
    --content '{"Simple":{"Subject":{"Data":"Permission test"},"Body":{"Text":{"Data":"test"}}}}' \
    --configuration-set-name "$role_config_set_name" \
    --region "$region" &>/dev/null; then
    pass "ses:SendEmail (simulator)"
  else
    fail "ses:SendEmail — AccessDenied or send error"
  fi

  section "Platform role: SES template permissions"

  # ses:ListEmailTemplates
  if _assumed sesv2 list-email-templates --region "$region" &>/dev/null; then
    pass "ses:ListEmailTemplates"
  else
    fail "ses:ListEmailTemplates — AccessDenied"
  fi

  section "Platform role: CloudWatch permissions"

  # cloudwatch:GetMetricData (minimal query)
  local end_time start_time
  end_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  start_time=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)

  if _assumed cloudwatch get-metric-data \
    --metric-data-queries '[{"Id":"m1","MetricStat":{"Metric":{"Namespace":"AWS/SES","MetricName":"Send","Dimensions":[]},"Period":300,"Stat":"Sum"},"ReturnData":true}]' \
    --start-time "$start_time" \
    --end-time "$end_time" \
    --region "$region" &>/dev/null; then
    pass "cloudwatch:GetMetricData"
  else
    fail "cloudwatch:GetMetricData — AccessDenied"
  fi

  section "Platform role: DynamoDB permissions"

  # dynamodb:DescribeTable
  if _assumed dynamodb describe-table \
    --table-name wraps-email-history --region "$region" &>/dev/null; then
    pass "dynamodb:DescribeTable"
  else
    fail "dynamodb:DescribeTable — AccessDenied"
  fi

  # dynamodb:Query (scan first item)
  if _assumed dynamodb query \
    --table-name wraps-email-history \
    --index-name accountId-sentAt-index \
    --key-condition-expression "accountId = :aid" \
    --expression-attribute-values "{\":aid\":{\"S\":\"${account_id}\"}}" \
    --limit 1 \
    --region "$region" &>/dev/null; then
    pass "dynamodb:Query"
  else
    fail "dynamodb:Query — AccessDenied"
  fi

  section "Platform role: Negative test (should be denied)"

  # iam:ListRoles should NOT be allowed
  if _assumed iam list-roles --max-items 1 &>/dev/null; then
    fail "iam:ListRoles should be denied but was allowed"
  else
    pass "iam:ListRoles correctly denied"
  fi

  # s3:ListBuckets should NOT be allowed
  if _assumed s3api list-buckets &>/dev/null; then
    fail "s3:ListBuckets should be denied but was allowed"
  else
    pass "s3:ListBuckets correctly denied"
  fi

  # Cleanup
  section "Platform role: Cleanup"
  _cleanup_test_role "$test_role" "$test_policy"
}

# Helper: delete test role and its inline policy
_cleanup_test_role() {
  local role="$1" policy="$2"
  aws iam delete-role-policy --role-name "$role" --policy-name "$policy" &>/dev/null || true
  if aws iam delete-role --role-name "$role" &>/dev/null; then
    pass "Cleaned up test role $role"
  else
    fail "Could not clean up test role $role"
  fi
}

# ─── Reply-Threading Verification ─────────────────────────────────────

# Verifies AWS resources created by `wraps email reply init`:
#   1. SSM SecureString parameter at /wraps/email/reply-secret/{domain}
#   2. Inbound Lambda has REPLY_SECRET_PARAMETER_PREFIX env var
#   3. Lambda IAM policy grants ssm:GetParameter on the reply-secret path
#   4. SES receipt rule includes r.mail.{domain} as a recipient
#
# Usage: verify_reply_threading <region> <domain>

verify_reply_threading() {
  local region="${1:?region required}"
  local domain="${2:?domain required}"
  local param_name="/wraps/email/reply-secret/${domain}"

  section "Reply threading: SSM parameter"

  local ssm_output
  if ssm_output=$(aws_check ssm get-parameter \
    --name "$param_name" \
    --region "$region" 2>&1); then
    pass "SSM parameter $param_name exists"

    local param_type
    param_type=$(echo "$ssm_output" | jq -r '.Parameter.Type // "NONE"')
    if [[ "$param_type" == "SecureString" ]]; then
      pass "SSM parameter type: SecureString"
    else
      fail "SSM parameter type: expected SecureString, got $param_type"
    fi
  else
    fail "SSM parameter $param_name not found" "$ssm_output"
  fi

  # Tags
  local ssm_tags
  ssm_tags=$(aws ssm list-tags-for-resource \
    --resource-type Parameter \
    --resource-id "$param_name" \
    --region "$region" \
    --output json 2>/dev/null)
  local ssm_managed_by
  ssm_managed_by=$(echo "$ssm_tags" | jq -r '.TagList[]? | select(.Key=="ManagedBy") | .Value // ""')
  if [[ "$ssm_managed_by" == wraps-* ]]; then
    pass "SSM parameter ManagedBy tag: $ssm_managed_by"
  else
    fail "SSM parameter missing/unexpected ManagedBy tag: $ssm_managed_by"
  fi

  section "Reply threading: Inbound Lambda configuration"

  local inbound_lambda=""
  if ! inbound_lambda=$(aws lambda get-function \
    --function-name wraps-inbound-email-processor \
    --region "$region" \
    --output json 2>&1); then
    fail "Lambda wraps-inbound-email-processor not found" "$inbound_lambda"
    return
  fi
  pass "Inbound Lambda exists"

  # Env var
  local prefix_env
  prefix_env=$(echo "$inbound_lambda" | jq -r '.Configuration.Environment.Variables.REPLY_SECRET_PARAMETER_PREFIX // ""')
  if [[ "$prefix_env" == "/wraps/email/reply-secret/" ]]; then
    pass "Lambda REPLY_SECRET_PARAMETER_PREFIX env var set correctly"
  else
    fail "Lambda REPLY_SECRET_PARAMETER_PREFIX: expected '/wraps/email/reply-secret/', got '$prefix_env'"
  fi

  # IAM: ssm:GetParameter permission on the reply-secret path
  local inbound_role_name
  inbound_role_name=$(echo "$inbound_lambda" | jq -r '.Configuration.Role // ""' | sed 's|.*/||')

  if [[ -z "$inbound_role_name" ]]; then
    fail "Could not resolve inbound Lambda IAM role"
  else
    local lambda_policies
    lambda_policies=$(aws iam list-role-policies --role-name "$inbound_role_name" --query 'PolicyNames' --output json 2>/dev/null)
    local found_ssm_stmt=0
    local p
    for p in $(echo "$lambda_policies" | jq -r '.[]'); do
      local doc
      doc=$(aws iam get-role-policy --role-name "$inbound_role_name" --policy-name "$p" --query 'PolicyDocument' --output json 2>/dev/null)
      if echo "$doc" | grep -q 'ssm:GetParameter'; then
        found_ssm_stmt=1
        break
      fi
    done

    if (( found_ssm_stmt == 1 )); then
      pass "Inbound Lambda IAM policy grants ssm:GetParameter"
    else
      fail "Inbound Lambda IAM policy missing ssm:GetParameter"
    fi
  fi

  section "Reply threading: SES receipt rule"

  # Find the receipt rule set in use
  local rule_set
  rule_set=$(aws ses describe-active-receipt-rule-set \
    --region "$region" \
    --query 'Metadata.Name' --output text 2>/dev/null)

  if [[ -z "$rule_set" || "$rule_set" == "None" ]]; then
    fail "No active SES receipt rule set"
    return
  fi
  pass "Active SES receipt rule set: $rule_set"

  # Check the CLI's catch-all rule has r.mail.{domain} in Recipients.
  local rule_output
  rule_output=$(aws ses describe-receipt-rule \
    --rule-set-name "$rule_set" \
    --rule-name wraps-inbound-catch-all \
    --region "$region" \
    --output json 2>/dev/null)

  if [[ -z "$rule_output" ]]; then
    fail "SES receipt rule wraps-inbound-catch-all not found in $rule_set"
  else
    local recipients
    recipients=$(echo "$rule_output" | jq -r '.Rule.Recipients // [] | join(",")')
    if [[ "$recipients" == *"r.mail.${domain}"* ]]; then
      pass "Receipt rule includes r.mail.${domain}"
    else
      fail "Receipt rule missing r.mail.${domain}; got: $recipients"
    fi
  fi
}

# ─── Inbound Trigger (plan 041) ──────────────────────────────────────

# Verifies the inbound trigger is wired for one mode and nothing else:
#   ses-lambda-action: rule = S3 action on mail/ + LambdaAction (Event) on
#     wraps-inbound-email-processor; Lambda policy has wraps-inbound-ses-invoke
#     (SourceArn = the wraps receipt rule) and no S3 invoke; the bucket has no
#     Lambda notification.
#   s3-notification: rule = S3 action on raw/ alone; Lambda policy has both
#     the SES and the S3 invoke statements; the bucket notifies the processor
#     on raw/.
# In both modes AllowSESPut covers raw/* and mail/*.
#
# Usage: verify_inbound_trigger <region> <account_id> [mode]

verify_inbound_trigger() {
  local region="${1:?region required}"
  local account_id="${2:?account id required}"
  local mode="${3:-ses-lambda-action}"
  local bucket="wraps-inbound-${account_id}-${region}"
  local fn="wraps-inbound-email-processor"
  local fn_arn="arn:aws:lambda:${region}:${account_id}:function:${fn}"
  local rule_arn="arn:aws:ses:${region}:${account_id}:receipt-rule-set/wraps-inbound-rules:receipt-rule/wraps-inbound-catch-all"

  section "Inbound trigger ($mode): receipt rule"

  local rule_output
  if ! rule_output=$(aws_check ses describe-receipt-rule \
    --rule-set-name wraps-inbound-rules \
    --rule-name wraps-inbound-catch-all \
    --region "$region"); then
    fail "Receipt rule wraps-inbound-catch-all not found" "$rule_output"
    return 0
  fi

  local prefixes lambda_arns invocation enabled
  prefixes=$(echo "$rule_output" | jq -r '[.Rule.Actions[].S3Action.ObjectKeyPrefix // empty] | join(",")')
  lambda_arns=$(echo "$rule_output" | jq -r '[.Rule.Actions[].LambdaAction.FunctionArn // empty] | join(",")')
  invocation=$(echo "$rule_output" | jq -r '[.Rule.Actions[].LambdaAction.InvocationType // empty] | join(",")')
  enabled=$(echo "$rule_output" | jq -r '.Rule.Enabled')

  if [[ "$enabled" == "true" ]]; then
    pass "Receipt rule is enabled"
  else
    fail "Receipt rule is not enabled (Enabled=$enabled)"
  fi

  if [[ "$mode" == "ses-lambda-action" ]]; then
    [[ "$prefixes" == "mail/" ]] && pass "Rule stores mail under mail/ only" \
      || fail "Rule S3 prefixes: expected 'mail/', got '$prefixes'"
    [[ "$lambda_arns" == "$fn_arn" ]] && pass "Rule invokes $fn" \
      || fail "Rule Lambda action: expected '$fn_arn', got '$lambda_arns'"
    [[ "$invocation" == "Event" ]] && pass "Lambda action is asynchronous (Event)" \
      || fail "Lambda action InvocationType: expected 'Event', got '$invocation'"
  else
    [[ "$prefixes" == "raw/" ]] && pass "Rule stores mail under raw/ only" \
      || fail "Rule S3 prefixes: expected 'raw/', got '$prefixes'"
    [[ -z "$lambda_arns" ]] && pass "Rule has no Lambda action" \
      || fail "Legacy rule must not invoke Lambda; got '$lambda_arns'"
  fi

  section "Inbound trigger ($mode): processor permissions"

  local policy
  policy=$(aws lambda get-policy --function-name "$fn" --region "$region" \
    --query Policy --output text 2>/dev/null || echo '{"Statement":[]}')

  local ses_stmt s3_stmt
  ses_stmt=$(echo "$policy" | jq -r --arg arn "$rule_arn" \
    '[.Statement[] | select(.Principal.Service == "ses.amazonaws.com") | .Condition.ArnLike["AWS:SourceArn"] // empty] | map(select(. == $arn)) | length')
  s3_stmt=$(echo "$policy" | jq -r \
    '[.Statement[] | select(.Principal.Service == "s3.amazonaws.com")] | length')

  (( ses_stmt >= 1 )) && pass "wraps-inbound-ses-invoke present, scoped to the wraps receipt rule" \
    || fail "No SES invoke permission scoped to $rule_arn"
  if [[ "$mode" == "ses-lambda-action" ]]; then
    (( s3_stmt == 0 )) && pass "No S3 invoke permission (wraps-inbound-s3-invoke removed)" \
      || fail "S3 invoke permission still present after the switch"
  else
    (( s3_stmt >= 1 )) && pass "S3 invoke permission present (legacy mode)" \
      || fail "Legacy mode is missing wraps-inbound-s3-invoke"
  fi

  section "Inbound trigger ($mode): bucket"

  local notif lambda_notifs
  notif=$(aws s3api get-bucket-notification-configuration --bucket "$bucket" --output json 2>/dev/null || echo '{}')
  lambda_notifs=$(echo "$notif" | jq -r '[.LambdaFunctionConfigurations // [] | .[] | .Filter.Key.FilterRules[]? | select(.Name == "Prefix" or .Name == "prefix") | .Value] | join(",")')
  if [[ "$mode" == "ses-lambda-action" ]]; then
    [[ -z "$lambda_notifs" ]] && pass "Bucket has no Lambda notification (old trigger gone)" \
      || fail "Bucket still notifies Lambda on: $lambda_notifs"
  else
    [[ "$lambda_notifs" == "raw/" ]] && pass "Bucket notifies the processor on raw/" \
      || fail "Legacy bucket notification prefixes: expected 'raw/', got '$lambda_notifs'"
  fi

  local bucket_policy covered
  bucket_policy=$(aws s3api get-bucket-policy --bucket "$bucket" --query Policy --output text 2>/dev/null || echo '{"Statement":[]}')
  covered=$(echo "$bucket_policy" | jq -r --arg b "arn:aws:s3:::${bucket}" \
    '[.Statement[] | select(.Sid == "AllowSESPut") | .Resource | if type == "array" then .[] else . end] | map(select(. == ($b + "/raw/*") or . == ($b + "/mail/*"))) | length')
  (( covered == 2 )) && pass "AllowSESPut covers raw/* and mail/*" \
    || fail "AllowSESPut covers $covered of raw/*, mail/*"
}

# Verifies `wraps email destroy` removed the inbound receipt rule set.
# Usage: verify_inbound_rules_removed <region>

verify_inbound_rules_removed() {
  local region="${1:?region required}"

  section "Teardown: inbound receipt rules"

  if aws ses describe-receipt-rule-set --rule-set-name wraps-inbound-rules --region "$region" &>/dev/null; then
    fail "Receipt rule set wraps-inbound-rules still exists"
  else
    pass "Receipt rule set wraps-inbound-rules removed"
  fi
}

# ─── Pre-Teardown ─────────────────────────────────────────────────────

# Rename the MailManager archive before deleting so the name is freed immediately.
# Without this, PENDING_DELETION archives block re-creation for days/weeks.
pre_teardown_rename_archive() {
  local archive_output
  archive_output=$(aws mailmanager list-archives --query "Archives[?ArchiveName=='wraps-email-archive' && ArchiveState=='ACTIVE']" --output json 2>/dev/null)
  local archive_count
  archive_count=$(echo "$archive_output" | jq 'length' 2>/dev/null || echo "0")
  if (( archive_count > 0 )); then
    local archive_id
    archive_id=$(echo "$archive_output" | jq -r '.[0].ArchiveId')
    local new_name="wraps-email-archive-deleted-$(date +%s)"
    if aws mailmanager update-archive --archive-id "$archive_id" --archive-name "$new_name" &>/dev/null; then
      printf "${CYAN}  Renamed archive %s → %s${NC}\n" "$archive_id" "$new_name"
    fi
  fi
}

# ─── Teardown Verification ───────────────────────────────────────────

verify_teardown() {
  local domain="${1:?domain required}"
  local region="${2:-us-east-1}"
  local teardown_config_set="${3:-wraps-email-tracking}"

  section "Teardown: Verify Resources Removed"

  # IAM Role
  if aws iam get-role --role-name wraps-email-role &>/dev/null; then
    fail "IAM role wraps-email-role still exists"
  else
    pass "IAM role wraps-email-role removed"
  fi

  # Lambda role (name varies: wraps-email-lambda-role* for CLI/CDK/Pulumi, wraps-email-processor-role for CFN)
  local lambda_roles
  lambda_roles=$(aws iam list-roles --query "Roles[?starts_with(RoleName, 'wraps-email-lambda-role') || starts_with(RoleName, 'wraps-email-processor-role')].RoleName" --output json 2>/dev/null)
  local lambda_role_count
  lambda_role_count=$(echo "$lambda_roles" | jq 'length')
  if (( lambda_role_count > 0 )); then
    fail "Lambda role still exists: $(echo "$lambda_roles" | jq -r '.[0]')"
  else
    pass "Lambda role wraps-email-*-role removed"
  fi

  # SES config set
  if aws sesv2 get-configuration-set \
    --configuration-set-name "$teardown_config_set" \
    --region "$region" &>/dev/null; then
    fail "SES config set $teardown_config_set still exists"
  else
    pass "SES config set $teardown_config_set removed"
  fi

  # SES domain identity
  if aws sesv2 get-email-identity \
    --email-identity "$domain" \
    --region "$region" &>/dev/null; then
    fail "SES email identity $domain still exists"
  else
    pass "SES email identity $domain removed"
  fi

  # DynamoDB
  if aws dynamodb describe-table \
    --table-name wraps-email-history \
    --region "$region" &>/dev/null; then
    fail "DynamoDB table wraps-email-history still exists"
  else
    pass "DynamoDB table wraps-email-history removed"
  fi

  # SQS queues — use a retry loop: SQS deletion is eventually consistent and
  # GetQueueUrl may return results for up to ~60s after DeleteQueue completes.
  local sqs_deadline=$(( $(date -u +%s) + 90 ))
  local sqs_main_gone=false sqs_dlq_gone=false
  while (( $(date -u +%s) < sqs_deadline )); do
    if ! aws sqs get-queue-url --queue-name wraps-email-events --region "$region" &>/dev/null; then
      sqs_main_gone=true
    fi
    if ! aws sqs get-queue-url --queue-name wraps-email-events-dlq --region "$region" &>/dev/null; then
      sqs_dlq_gone=true
    fi
    [[ "$sqs_main_gone" == "true" && "$sqs_dlq_gone" == "true" ]] && break
    sleep 5
  done

  if [[ "$sqs_main_gone" == "true" ]]; then
    pass "SQS queue wraps-email-events removed"
  else
    fail "SQS queue wraps-email-events still exists"
  fi

  if [[ "$sqs_dlq_gone" == "true" ]]; then
    pass "SQS DLQ wraps-email-events-dlq removed"
  else
    fail "SQS DLQ wraps-email-events-dlq still exists"
  fi

  # Lambda
  if aws lambda get-function \
    --function-name wraps-email-event-processor \
    --region "$region" &>/dev/null; then
    fail "Lambda wraps-email-event-processor still exists"
  else
    pass "Lambda wraps-email-event-processor removed"
  fi

  # EventBridge rule
  if aws events describe-rule \
    --name wraps-email-events-to-sqs \
    --region "$region" &>/dev/null; then
    fail "EventBridge rule wraps-email-events-to-sqs still exists"
  else
    pass "EventBridge rule wraps-email-events-to-sqs removed"
  fi

  # SMTP user
  if aws iam get-user --user-name wraps-email-smtp-user &>/dev/null; then
    fail "IAM user wraps-email-smtp-user still exists"
  else
    pass "IAM user wraps-email-smtp-user removed"
  fi

  # Webhook connection
  if aws events describe-connection \
    --name wraps-webhook-connection \
    --region "$region" &>/dev/null; then
    fail "EventBridge connection wraps-webhook-connection still exists"
  else
    pass "EventBridge connection wraps-webhook-connection removed"
  fi

  # Webhook API destination
  if aws events describe-api-destination \
    --name wraps-webhook-destination \
    --region "$region" &>/dev/null; then
    fail "API destination wraps-webhook-destination still exists"
  else
    pass "API destination wraps-webhook-destination removed"
  fi

  # Console access role
  if aws iam get-role --role-name wraps-console-access-role &>/dev/null; then
    fail "IAM role wraps-console-access-role still exists"
  else
    pass "IAM role wraps-console-access-role removed"
  fi

  # Reply-threading SSM parameter (per-domain, scoped by prefix)
  local reply_params
  reply_params=$(aws ssm describe-parameters \
    --parameter-filters "Key=Name,Option=BeginsWith,Values=/wraps/email/reply-secret/" \
    --region "$region" \
    --query 'Parameters[].Name' --output json 2>/dev/null)
  local reply_param_count
  reply_param_count=$(echo "$reply_params" | jq 'length // 0')
  if (( reply_param_count > 0 )); then
    fail "SSM reply-secret parameter(s) still exist: $(echo "$reply_params" | jq -r 'join(",")')"
  else
    pass "SSM reply-secret parameters removed"
  fi

  # SNS alerting topic
  local alerting_topic_arn
  alerting_topic_arn=$(aws sns list-topics --region "$region" --query "Topics[?ends_with(TopicArn, ':wraps-email-alerts')].TopicArn | [0]" --output text 2>/dev/null)
  if [[ "$alerting_topic_arn" != "None" && -n "$alerting_topic_arn" ]]; then
    fail "SNS topic wraps-email-alerts still exists"
  else
    pass "SNS topic wraps-email-alerts removed"
  fi

  # CloudWatch alarms
  for alarm_name in wraps-email-bounce-rate-warning wraps-email-bounce-rate-critical wraps-email-complaint-rate-warning wraps-email-complaint-rate-critical wraps-email-dlq-messages; do
    if aws cloudwatch describe-alarms \
      --alarm-names "$alarm_name" \
      --region "$region" \
      --query 'MetricAlarms[0].AlarmName' --output text 2>/dev/null | grep -q "$alarm_name"; then
      fail "CloudWatch alarm $alarm_name still exists"
    else
      pass "CloudWatch alarm $alarm_name removed"
    fi
  done

  # MailManager archive (accepts PENDING_DELETION as removed — archives take time to purge)
  local archive_output
  archive_output=$(aws mailmanager list-archives --query "Archives[?ArchiveName=='wraps-email-archive']" --output json 2>/dev/null)
  local archive_count
  archive_count=$(echo "$archive_output" | jq 'length' 2>/dev/null || echo "0")
  if (( archive_count > 0 )); then
    local archive_state
    archive_state=$(echo "$archive_output" | jq -r '.[0].ArchiveState // "UNKNOWN"')
    if [[ "$archive_state" == "PENDING_DELETION" ]]; then
      pass "MailManager archive wraps-email-archive pending deletion"
    else
      fail "MailManager archive wraps-email-archive still exists (state: $archive_state)"
    fi
  else
    pass "MailManager archive wraps-email-archive removed"
  fi
}

# ─── Dual-Plane Coexistence Verification ─────────────────────────────

# Count rule targets whose ARN contains a substring. Echoes the count.
_coexistence_target_count() {
  local targets_json="$1"
  local needle="$2"
  echo "$targets_json" \
    | jq --arg n "$needle" '[.Targets[]? | select(.Arn | contains($n))] | length' \
      2>/dev/null || echo 0
}

# Verify that SES events reach BOTH the Wraps platform and a self-hosted
# control plane from the same EventBridge rule (plans 134-138).
#
# The unit tests for this behaviour all mock buildEmailStackConfig, so the
# thing that is actually load-bearing — what Pulumi built in the customer's
# AWS account — is only checked here. Requires a live deployment; it asserts
# end state and never mutates anything.
#
# Args:
#   $1 region       — AWS region
#   $2 account_id   — 12-digit AWS account ID (for the webhook path assertion)
#   $3 selfhost_url — BASE url of the self-hosted API, no trailing slash
verify_coexistence() {
  local region="${1:-us-east-1}"
  local account_id="${2:?account_id is required}"
  local selfhost_url="${3:?selfhost_url is required}"
  # "true" (the default) for the coexistence scenario, whose whole point is that
  # both planes receive events. Pass "false" for an account that has only ever
  # run `wraps selfhost connect` — there, the absence of a platform target is
  # the correct end state, not the regression.
  local expect_platform="${4:-true}"

  # Resource names below are spelled out literally, never derived — the harness
  # asserts what the infrastructure code hardcodes. Sources: eventbridge.ts
  # (rule :83, platform connection :163, platform destination :179) and
  # eventbridge-selfhost-webhook.ts (connection :51, destination :67, role :78).
  local expected_endpoint="${selfhost_url}/webhooks/ses/${account_id}"

  section "Coexistence: Rule targets"

  local rule_output
  if rule_output=$(aws_check events describe-rule \
    --name "wraps-email-events-to-sqs" \
    --region "$region"); then
    pass "EventBridge rule wraps-email-events-to-sqs exists"

    local rule_state
    rule_state=$(echo "$rule_output" | jq -r '.State // "DISABLED"')
    if [[ "$rule_state" == "ENABLED" ]]; then
      pass "EventBridge rule is ENABLED"
    else
      fail "EventBridge rule state: expected ENABLED, got $rule_state"
    fi
  else
    fail "EventBridge rule wraps-email-events-to-sqs not found" "$rule_output"
  fi

  # Fall back to an empty target list so every assertion below still reports a
  # fail rather than aborting the whole run under `set -e`.
  local targets_output
  if ! targets_output=$(aws_check events list-targets-by-rule \
    --rule "wraps-email-events-to-sqs" \
    --region "$region"); then
    fail "Could not list targets for wraps-email-events-to-sqs" "$targets_output"
    targets_output='{"Targets":[]}'
  fi

  local target_count
  target_count=$(echo "$targets_output" | jq '.Targets | length' 2>/dev/null || echo 0)

  # Expected composition: SQS + platform webhook + selfhost webhook, plus the
  # user webhook target when the customer configured one. The user target is
  # the only optional member — `eventbridge.ts` creates it solely when
  # `config.userWebhook` is set — so it is counted, not assumed. A flat
  # "exactly 4" reported a false failure on a deployment that simply has no
  # user webhook, which is the common case (demo.wraps.dev included).
  #
  # The ceiling stays exact and stays a failure: EventBridge allows 5 targets
  # per rule (hard AWS quota, not adjustable), so anything at 5 turns "we
  # quietly added another target" into a failing test here instead of a
  # LimitExceeded on a customer's next deploy.
  local -i user_target_count expected_total
  user_target_count=$(_coexistence_target_count "$targets_output" "wraps-user-webhook-destination")
  expected_total=$(( 2 + user_target_count ))
  [[ "$expect_platform" == "true" ]] && expected_total=$(( expected_total + 1 ))

  if (( target_count >= 5 )); then
    fail "EventBridge rule has $target_count targets, expected $expected_total" \
      "at the AWS hard quota of 5 targets per rule — the next target will be rejected"
  elif (( target_count == expected_total )); then
    if (( user_target_count > 0 )); then
      pass "EventBridge rule has exactly $target_count targets (SQS + platform + user + selfhost)"
    else
      pass "EventBridge rule has exactly $target_count targets (SQS + platform + selfhost; no user webhook configured)"
    fi
  else
    fail "EventBridge rule has $target_count target(s), expected $expected_total" \
      "expected SQS + platform webhook + selfhost webhook, plus a user webhook target only when one is configured"
  fi

  local sqs_target_count
  sqs_target_count=$(_coexistence_target_count "$targets_output" "sqs")
  if (( sqs_target_count == 1 )); then
    pass "Exactly one SQS target (the events pipeline)"
  else
    fail "Expected exactly 1 SQS target, found $sqs_target_count"
  fi

  # THE coexistence regression assertion. If the platform target is missing,
  # a self-hosted connect deleted app.wraps.dev's event delivery.
  local platform_target_count
  platform_target_count=$(_coexistence_target_count "$targets_output" "wraps-webhook-destination")
  if [[ "$expect_platform" != "true" ]]; then
    if (( platform_target_count == 0 )); then
      pass "No platform target, as expected (this account has never run a non-self-hosted connect)"
    else
      fail "Found $platform_target_count wraps-webhook-destination target(s) on an account with no platform identity" \
        "something is POSTing this account's SES events to app.wraps.dev — check services.email.webhookSecret in connection metadata"
    fi
  elif (( platform_target_count == 1 )); then
    pass "Exactly one platform target (wraps-webhook-destination) — app.wraps.dev still receives events"
  else
    fail "Expected exactly 1 wraps-webhook-destination target, found $platform_target_count" \
      "the self-hosted target must be an ADDITION; losing this one means app.wraps.dev stopped receiving SES events"
  fi

  local selfhost_target_count
  selfhost_target_count=$(_coexistence_target_count "$targets_output" "wraps-selfhost-webhook-destination")
  if (( selfhost_target_count == 1 )); then
    pass "Exactly one self-hosted target (wraps-selfhost-webhook-destination)"
  else
    fail "Expected exactly 1 wraps-selfhost-webhook-destination target, found $selfhost_target_count"
  fi

  section "Coexistence: Self-hosted API destination"

  local dest_output
  if dest_output=$(aws_check events describe-api-destination \
    --name "wraps-selfhost-webhook-destination" \
    --region "$region"); then
    pass "API destination wraps-selfhost-webhook-destination exists"

    # Whole-string compare: a substring check would pass for a truncated or
    # doubled path.
    local endpoint
    endpoint=$(echo "$dest_output" | jq -r '.InvocationEndpoint // ""')
    if [[ "$endpoint" == "$expected_endpoint" ]]; then
      pass "Self-hosted invocation endpoint: $endpoint"
    else
      fail "Self-hosted invocation endpoint mismatch" \
        "expected $expected_endpoint, got ${endpoint:-<empty>}"
    fi

    local rate_limit
    rate_limit=$(echo "$dest_output" | jq -r '.InvocationRateLimitPerSecond // 0')
    if [[ "$rate_limit" == "300" ]]; then
      pass "Self-hosted API destination rate limit: 300/s"
    else
      fail "Self-hosted API destination rate limit: expected 300, got $rate_limit"
    fi

    # Connection ARN shape: arn:aws:events:<region>:<acct>:connection/<name>/<uuid>
    local conn_arn conn_name
    conn_arn=$(echo "$dest_output" | jq -r '.ConnectionArn // ""')
    conn_name="${${conn_arn%/*}##*/}"
    if [[ "$conn_name" == "wraps-selfhost-webhook-connection" ]]; then
      pass "Self-hosted API destination uses connection wraps-selfhost-webhook-connection"
    else
      fail "Self-hosted API destination connection: expected wraps-selfhost-webhook-connection, got ${conn_name:-<empty>}" \
        "ConnectionArn was ${conn_arn:-<empty>}"
    fi
  else
    fail "API destination wraps-selfhost-webhook-destination not found" "$dest_output"
  fi

  local conn_output
  if conn_output=$(aws_check events describe-connection \
    --name "wraps-selfhost-webhook-connection" \
    --region "$region"); then
    pass "EventBridge connection wraps-selfhost-webhook-connection exists"

    local auth_type
    auth_type=$(echo "$conn_output" | jq -r '.AuthorizationType // "NONE"')
    if [[ "$auth_type" == "API_KEY" ]]; then
      pass "Self-hosted connection auth type: API_KEY"
    else
      fail "Self-hosted connection auth type: expected API_KEY, got $auth_type"
    fi

    # Header NAME only. verify.sh output is routinely pasted into issues, so
    # never read or print anything else out of AuthParameters — a swap to
    # X-Wraps-Signature would 401 every event, which is what this catches.
    local api_key_name
    api_key_name=$(echo "$conn_output" \
      | jq -r '.AuthParameters.ApiKeyAuthParameters.ApiKeyName // ""')
    if [[ "$api_key_name" == "X-Wraps-Api-Key" ]]; then
      pass "Self-hosted connection auth header: X-Wraps-Api-Key"
    else
      fail "Self-hosted connection auth header: expected X-Wraps-Api-Key, got ${api_key_name:-<empty>}"
    fi
  else
    fail "EventBridge connection wraps-selfhost-webhook-connection not found" "$conn_output"
  fi

  section "Coexistence: Self-hosted target config"

  local selfhost_target
  selfhost_target=$(echo "$targets_output" \
    | jq --arg n "wraps-selfhost-webhook-destination" \
      'first(.Targets[]? | select(.Arn | contains($n))) // {}' 2>/dev/null || echo '{}')

  if [[ -n "$selfhost_target" && "$selfhost_target" != "{}" ]]; then
    local dlq_arn
    dlq_arn=$(echo "$selfhost_target" | jq -r '.DeadLetterConfig.Arn // ""')
    if [[ -n "$dlq_arn" ]]; then
      pass "Self-hosted target has a DLQ: ${dlq_arn##*:}"
    else
      fail "Self-hosted target has no DeadLetterConfig.Arn" \
        "undeliverable events would be dropped silently"
    fi

    # The self-hosted control plane runs the same apps/api code as the
    # platform and expects the raw SES envelope.
    if echo "$selfhost_target" | jq -e '.InputTransformer' &>/dev/null; then
      fail "Self-hosted target has an InputTransformer" \
        "the self-hosted control plane expects the raw SES event envelope"
    else
      pass "Self-hosted target has no InputTransformer (raw SES envelope)"
    fi
  else
    fail "No rule target found for wraps-selfhost-webhook-destination"
  fi

  local role_output
  if role_output=$(aws_check iam get-role --role-name "wraps-selfhost-webhook-role"); then
    pass "IAM role wraps-selfhost-webhook-role exists"

    if echo "$role_output" \
      | jq -e '.Role.AssumeRolePolicyDocument.Statement[] | select(.Principal.Service | tostring | contains("events.amazonaws.com"))' \
        &>/dev/null; then
      pass "Self-hosted webhook role trusts events.amazonaws.com"
    else
      fail "Self-hosted webhook role missing events.amazonaws.com trust"
    fi

    local policy_names
    if policy_names=$(aws_check iam list-role-policies --role-name "wraps-selfhost-webhook-role"); then
      local found_invoke="false"
      local policy_name policy_doc
      for policy_name in $(echo "$policy_names" | jq -r '.PolicyNames[]?'); do
        policy_doc=$(aws_check iam get-role-policy \
          --role-name "wraps-selfhost-webhook-role" \
          --policy-name "$policy_name") || continue
        if echo "$policy_doc" \
          | jq -e '.PolicyDocument.Statement[] | select(.Action | tostring | contains("events:InvokeApiDestination"))' \
            &>/dev/null; then
          found_invoke="true"
          break
        fi
      done
      if [[ "$found_invoke" == "true" ]]; then
        pass "Self-hosted webhook role grants events:InvokeApiDestination"
      else
        fail "Self-hosted webhook role has no inline policy granting events:InvokeApiDestination"
      fi
    else
      fail "Could not list inline policies for wraps-selfhost-webhook-role" "$policy_names"
    fi
  else
    fail "IAM role wraps-selfhost-webhook-role not found" "$role_output"
  fi

  section "Coexistence: Legacy reroute is gone"

  # Resolve every API-destination target's invocation endpoint and count how
  # many POST to the self-hosted control plane. Two means the legacy
  # `--reroute-events` primary is still wired up alongside the new selfhost
  # target, so every SES event is delivered twice. Target ARN shape:
  # arn:aws:events:<region>:<acct>:api-destination/<name>/<uuid>
  local -a dest_names
  dest_names=($(echo "$targets_output" \
    | jq -r '.Targets[]?.Arn | select(contains(":api-destination/")) | split("/")[1]' \
      2>/dev/null || true))

  local -i selfhost_endpoint_hits=0
  local dest_name dest_endpoint
  for dest_name in "${dest_names[@]}"; do
    dest_endpoint=$(aws events describe-api-destination \
      --name "$dest_name" \
      --region "$region" \
      --query 'InvocationEndpoint' --output text 2>/dev/null) || dest_endpoint=""
    if [[ "$dest_endpoint" == "$expected_endpoint" ]]; then
      selfhost_endpoint_hits+=1
    fi
  done

  if (( selfhost_endpoint_hits == 1 )); then
    pass "Exactly one target POSTs to the self-hosted control plane"
  elif (( selfhost_endpoint_hits == 0 )); then
    fail "No target POSTs to the self-hosted control plane" \
      "expected exactly one target at $expected_endpoint"
  else
    fail "$selfhost_endpoint_hits targets POST to $expected_endpoint" \
      "the legacy --reroute-events target is still wired alongside wraps-selfhost-webhook-destination — every SES event is delivered twice"
  fi
}
