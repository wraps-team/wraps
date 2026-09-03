import {
  CloudFormationClient,
  DescribeStacksCommand,
  type Stack,
} from "@aws-sdk/client-cloudformation";

const LIVE = new Set([
  "CREATE_COMPLETE",
  "UPDATE_COMPLETE",
  "UPDATE_ROLLBACK_COMPLETE",
  "ROLLBACK_COMPLETE",
  "IMPORT_COMPLETE",
  "CREATE_IN_PROGRESS",
  "UPDATE_IN_PROGRESS",
]);

function isWrapsStack(s: Stack): boolean {
  if (!(s.StackStatus && LIVE.has(s.StackStatus))) {
    return false;
  }
  if (s.StackName?.startsWith("wraps-")) {
    return true;
  }
  return (s.Tags ?? []).some(
    (t) => t.Key === "ManagedBy" && (t.Value ?? "").startsWith("wraps")
  );
}

/**
 * Names of live CloudFormation stacks in `region` that look like Wraps
 * stacks: name starts with `wraps-`, or a tag ManagedBy=wraps. Returns
 * `checked: false` when the caller lacks cloudformation:DescribeStacks —
 * "could not check" is not the same thing as "none found", and a doctor that
 * conflated the two would label a CloudFormation-owned role an orphan.
 */
export async function findWrapsCloudFormationStacks(
  region: string
): Promise<{ stacks: string[]; checked: boolean }> {
  const cfn = new CloudFormationClient({ region });
  const stacks: string[] = [];
  let nextToken: string | undefined;
  try {
    do {
      const page = await cfn.send(
        new DescribeStacksCommand({ NextToken: nextToken })
      );
      for (const s of page.Stacks ?? []) {
        if (isWrapsStack(s)) {
          stacks.push(s.StackName ?? "");
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);
    return { stacks: stacks.filter(Boolean), checked: true };
    // baseline:allow-next-line no-swallowed-errors — no cloudformation:DescribeStacks; report unchecked, never "none"
  } catch (_error) {
    return { stacks: [], checked: false };
  }
}
