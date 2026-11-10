/**
 * Read-only check that the four pieces of an inbound trigger agree (design
 * §7): the receipt rule's actions, the saved mode, the SES invoke permission
 * on the processor, and the bucket policy covering mail/*. Catches a switch
 * that stopped part-way, and an older CLI that redeployed the stack from
 * another machine and removed the SES permission.
 */

import { GetPolicyCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetBucketPolicyCommand, S3Client } from "@aws-sdk/client-s3";
import { INBOUND_MAIL_PREFIX } from "@wraps/core";
import type { InboundTrigger } from "../../types/index.js";
import {
  INBOUND_PROCESSOR_FUNCTION_NAME,
  INBOUND_SES_INVOKE_PERMISSION,
} from "./inbound-names.js";
import {
  describeInboundReceiptRule,
  receiptRuleTriggerOf,
} from "./receipt-rules.js";

export type InboundTriggerMismatch =
  | "rule-missing"
  | "rule-unrecognized"
  | "rule-differs-from-saved"
  | "ses-invoke-permission-missing"
  | "bucket-policy-missing-mail";

export type InboundTriggerCheck = {
  /** Mode in metadata (absent = "s3-notification"). */
  savedTrigger: InboundTrigger;
  /** Mode the rule's actions implement; null when the rule couldn't be read. */
  ruleTrigger: InboundTrigger | "missing" | "unknown" | null;
  /** wraps-inbound-ses-invoke present; null when it couldn't be checked. */
  sesInvokePermission: boolean | null;
  /** AllowSESPut covers mail/*; null when it couldn't be checked. */
  bucketPolicyCoversMail: boolean | null;
  mismatches: InboundTriggerMismatch[];
  /** One human sentence per mismatch, each naming the fix. */
  warnings: string[];
};

type PolicyStatement = {
  Sid?: string;
  Effect?: string;
  Principal?: { Service?: string | string[] } | string;
  Action?: string | string[];
  Resource?: string | string[];
};

function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function servicePrincipals(statement: PolicyStatement): string[] {
  const principal = statement.Principal;
  if (!principal || typeof principal === "string") {
    return [];
  }
  return asList(principal.Service);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "";
}

async function checkSesInvokePermission(
  region: string
): Promise<boolean | null> {
  try {
    const response = await new LambdaClient({ region }).send(
      new GetPolicyCommand({ FunctionName: INBOUND_PROCESSOR_FUNCTION_NAME })
    );
    const statements: PolicyStatement[] =
      JSON.parse(response.Policy ?? "{}").Statement ?? [];
    return statements.some(
      (s) =>
        s.Sid === INBOUND_SES_INVOKE_PERMISSION ||
        (servicePrincipals(s).includes("ses.amazonaws.com") &&
          asList(s.Action).includes("lambda:InvokeFunction"))
    );
  } catch (error) {
    // No resource policy at all means no SES permission.
    if (errorName(error) === "ResourceNotFoundException") {
      return false;
    }
    return null;
  }
}

async function checkBucketPolicyCoversMail(
  region: string,
  bucketName: string
): Promise<boolean | null> {
  try {
    const response = await new S3Client({ region }).send(
      new GetBucketPolicyCommand({ Bucket: bucketName })
    );
    const statements: PolicyStatement[] =
      JSON.parse(response.Policy ?? "{}").Statement ?? [];
    const mailResource = `arn:aws:s3:::${bucketName}/${INBOUND_MAIL_PREFIX}*`;
    return statements.some(
      (s) =>
        s.Effect === "Allow" &&
        servicePrincipals(s).includes("ses.amazonaws.com") &&
        asList(s.Action).includes("s3:PutObject") &&
        asList(s.Resource).includes(mailResource)
    );
  } catch (error) {
    if (errorName(error) === "NoSuchBucketPolicy") {
      return false;
    }
    return null;
  }
}

async function readRuleTrigger(
  region: string
): Promise<InboundTriggerCheck["ruleTrigger"]> {
  try {
    return receiptRuleTriggerOf(await describeInboundReceiptRule(region));
  } catch {
    return null;
  }
}

const FIX = "Run `wraps email upgrade` to bring the trigger back in line.";

/** Compute the mismatches between the four pieces. Pure; exported for tests. */
export function compareInboundTrigger(
  check: Omit<InboundTriggerCheck, "mismatches" | "warnings">
): Pick<InboundTriggerCheck, "mismatches" | "warnings"> {
  const mismatches: InboundTriggerMismatch[] = [];
  const warnings: string[] = [];
  const { savedTrigger, ruleTrigger } = check;

  if (ruleTrigger === "missing") {
    mismatches.push("rule-missing");
    warnings.push(
      "The receipt rule wraps-inbound-catch-all does not exist, so no inbound mail is received. Run `wraps email inbound add` (or `wraps email inbound init`) to recreate it."
    );
  } else if (ruleTrigger === "unknown") {
    mismatches.push("rule-unrecognized");
    warnings.push(
      `The receipt rule's actions match neither trigger mode (raw/ alone, or mail/ + the processor's Lambda action). ${FIX}`
    );
  } else if (ruleTrigger !== null && ruleTrigger !== savedTrigger) {
    mismatches.push("rule-differs-from-saved");
    warnings.push(
      `The receipt rule uses the ${ruleTrigger} trigger but metadata says ${savedTrigger} (a switch stopped part-way). ${FIX}`
    );
  }

  const lambdaActionInUse =
    ruleTrigger === "ses-lambda-action" || savedTrigger === "ses-lambda-action";
  if (lambdaActionInUse && check.sesInvokePermission === false) {
    mismatches.push("ses-invoke-permission-missing");
    warnings.push(
      `The processor has no ${INBOUND_SES_INVOKE_PERMISSION} permission, so SES can't invoke it and new mail is not processed (an older CLI may have redeployed the stack). ${FIX}`
    );
  }
  if (lambdaActionInUse && check.bucketPolicyCoversMail === false) {
    mismatches.push("bucket-policy-missing-mail");
    warnings.push(
      `The inbound bucket policy does not let SES write to ${INBOUND_MAIL_PREFIX}, where the Lambda-action trigger stores mail. ${FIX}`
    );
  }

  return { mismatches, warnings };
}

/** Run the read-only checks. Never throws: an unreadable piece is null. */
export async function checkInboundTrigger(params: {
  region: string;
  bucketName: string;
  savedTrigger: InboundTrigger;
}): Promise<InboundTriggerCheck> {
  const [ruleTrigger, sesInvokePermission, bucketPolicyCoversMail] =
    await Promise.all([
      readRuleTrigger(params.region),
      checkSesInvokePermission(params.region),
      checkBucketPolicyCoversMail(params.region, params.bucketName),
    ]);
  const pieces = {
    savedTrigger: params.savedTrigger,
    ruleTrigger,
    sesInvokePermission,
    bucketPolicyCoversMail,
  };
  return { ...pieces, ...compareInboundTrigger(pieces) };
}
