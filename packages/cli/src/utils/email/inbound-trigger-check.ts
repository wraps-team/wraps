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
  RULE_NAME,
  RULE_SET_NAME,
} from "./inbound-names.js";
import {
  type ActiveRuleSetRead,
  describeInboundReceiptRule,
  receiptRuleTriggerOf,
} from "./receipt-rules.js";

export type InboundTriggerMismatch =
  | "rule-missing"
  | "rule-unrecognized"
  | "rule-differs-from-saved"
  | "rule-disabled"
  | "rule-set-inactive"
  | "ses-invoke-permission-missing"
  | "bucket-policy-missing-mail";

export type InboundTriggerCheck = {
  /** Mode in metadata (absent = "s3-notification"). */
  savedTrigger: InboundTrigger;
  /** Mode the rule's actions implement; null when the rule couldn't be read. */
  ruleTrigger: InboundTrigger | "missing" | "unknown" | null;
  /** The rule's Enabled flag; null when there is no rule or it couldn't be read. */
  ruleEnabled: boolean | null;
  /**
   * The region's active receipt rule set (null = none active, or unreadable;
   * see activeRuleSetReadable). SES allows one active set per region.
   */
  activeRuleSet: string | null;
  /** False when the active set couldn't be read (e.g. missing permission). */
  activeRuleSetReadable: boolean;
  /**
   * wraps-inbound-rules is not the active set, so no mail reaches Wraps.
   * null when the active set couldn't be read.
   */
  ruleSetInactive: boolean | null;
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

async function readRule(
  region: string
): Promise<Pick<InboundTriggerCheck, "ruleTrigger" | "ruleEnabled">> {
  try {
    const rule = await describeInboundReceiptRule(region);
    return {
      ruleTrigger: receiptRuleTriggerOf(rule),
      ruleEnabled: rule ? rule.Enabled === true : null,
    };
  } catch {
    return { ruleTrigger: null, ruleEnabled: null };
  }
}

/**
 * Compute the mismatches between the pieces. Pure; exported for tests.
 * `repairCommand` is the command each trigger warning names as the fix
 * (status passes `wraps email upgrade --action redeploy --region <r> --yes`).
 */
export function compareInboundTrigger(
  check: Omit<InboundTriggerCheck, "mismatches" | "warnings">,
  repairCommand: string
): Pick<InboundTriggerCheck, "mismatches" | "warnings"> {
  const FIX = `Run \`${repairCommand}\` to re-apply the saved configuration with this CLI version and bring the trigger back in line (add --preview first to see the stack changes).`;
  const mismatches: InboundTriggerMismatch[] = [];
  const warnings: string[] = [];
  const { savedTrigger, ruleTrigger } = check;

  // SES allows one active rule set per region. Wraps never suggests a command
  // that would activate its set over the customer's own (invariant 1).
  if (check.ruleSetInactive === true) {
    mismatches.push("rule-set-inactive");
    warnings.push(
      check.activeRuleSet
        ? `The active receipt rule set in this region is ${check.activeRuleSet}, not ${RULE_SET_NAME}, so no inbound mail reaches Wraps. Wraps leaves it that way; note that \`wraps email inbound init\` (and \`inbound add\` when it has to recreate the rule) activates ${RULE_SET_NAME}, which deactivates ${check.activeRuleSet}.`
        : `No receipt rule set is active in this region, so no inbound mail reaches Wraps. Check the SES console (Email receiving) before activating ${RULE_SET_NAME}.`
    );
  }

  if (ruleTrigger === "missing") {
    mismatches.push("rule-missing");
    warnings.push(
      check.ruleSetInactive === false
        ? `The receipt rule ${RULE_NAME} does not exist, so no inbound mail is received. \`wraps email inbound init\` recreates it.`
        : `The receipt rule ${RULE_NAME} does not exist, so no inbound mail is received.`
    );
  } else {
    if (check.ruleEnabled === false) {
      mismatches.push("rule-disabled");
      warnings.push(
        `The receipt rule ${RULE_NAME} is disabled, so SES skips it and no inbound mail reaches Wraps. Wraps keeps the rule's Enabled flag as it finds it: re-enable the rule in the SES console (Email receiving, rule set ${RULE_SET_NAME}).`
      );
    }
    if (ruleTrigger === "unknown") {
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
  repairCommand: string;
  /** From readActiveReceiptRuleSet (status already reads it). */
  activeRuleSetRead: ActiveRuleSetRead;
}): Promise<InboundTriggerCheck> {
  const [rule, sesInvokePermission, bucketPolicyCoversMail] = await Promise.all(
    [
      readRule(params.region),
      checkSesInvokePermission(params.region),
      checkBucketPolicyCoversMail(params.region, params.bucketName),
    ]
  );
  const pieces = {
    savedTrigger: params.savedTrigger,
    ...rule,
    activeRuleSet: params.activeRuleSetRead.readable
      ? params.activeRuleSetRead.name
      : null,
    activeRuleSetReadable: params.activeRuleSetRead.readable,
    ruleSetInactive: params.activeRuleSetRead.readable
      ? params.activeRuleSetRead.name !== RULE_SET_NAME
      : null,
    sesInvokePermission,
    bucketPolicyCoversMail,
  };
  return { ...pieces, ...compareInboundTrigger(pieces, params.repairCommand) };
}
