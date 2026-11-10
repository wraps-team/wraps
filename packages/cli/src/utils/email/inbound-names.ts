/**
 * Fixed names shared by the inbound receipt rule (AWS SDK, `receipt-rules.ts`)
 * and the inbound stack resources (Pulumi, `resources/lambda-inbound.ts`).
 * Kept free of SDK and Pulumi imports so both sides can use them.
 */

export const RULE_SET_NAME = "wraps-inbound-rules";
export const RULE_NAME = "wraps-inbound-catch-all";

/** Name of the inbound processor Lambda function. */
export const INBOUND_PROCESSOR_FUNCTION_NAME = "wraps-inbound-email-processor";

/**
 * Pulumi name and Lambda policy statement id of the permission that lets SES
 * invoke the processor from the receipt rule's Lambda action.
 */
export const INBOUND_SES_INVOKE_PERMISSION = "wraps-inbound-ses-invoke";

/** ARN of the inbound processor in this account and region. */
export function inboundProcessorArn(region: string, accountId: string): string {
  return `arn:aws:lambda:${region}:${accountId}:function:${INBOUND_PROCESSOR_FUNCTION_NAME}`;
}

/** ARN of the wraps receipt rule, the source of SES's Lambda invocations. */
export function inboundReceiptRuleArn(
  region: string,
  accountId: string
): string {
  return `arn:aws:ses:${region}:${accountId}:receipt-rule-set/${RULE_SET_NAME}:receipt-rule/${RULE_NAME}`;
}
