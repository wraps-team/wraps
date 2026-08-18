import {
  CloudWatchClient,
  GetMetricDataCommand,
  type GetMetricDataCommandOutput,
} from "@aws-sdk/client-cloudwatch";
import { db } from "@wraps/db";
import { getOrAssumeRole } from "./credential-cache";

/**
 * Why a CloudWatch read failed, in terms the dashboard can act on.
 *
 * AWS SDK v3 error names are unreliable — several services return
 * `name: "Error"` with the real exception only in `message` — so every
 * classifier below checks the name AND the message.
 */
export type CloudWatchErrorKind =
  | "credentials"
  | "access_denied"
  | "throttled"
  | "invalid_request"
  | "not_found"
  | "unknown";

type CloudWatchError = Error & {
  cloudWatchErrorKind: CloudWatchErrorKind;
};

const ERROR_PATTERNS: Array<{ kind: CloudWatchErrorKind; match: RegExp }> = [
  {
    kind: "credentials",
    match:
      /ExpiredToken|InvalidClientTokenId|UnrecognizedClient|CredentialsProviderError|IncompleteSignature|SignatureDoesNotMatch|Could not load credentials/i,
  },
  {
    kind: "access_denied",
    match: /AccessDenied|UnauthorizedOperation|not authorized to perform/i,
  },
  {
    kind: "throttled",
    match: /Throttling|TooManyRequests|RequestLimitExceeded|Rate exceeded/i,
  },
  { kind: "not_found", match: /ResourceNotFound|NoSuchEntity|NotFound/i },
  {
    kind: "invalid_request",
    match: /InvalidParameter|ValidationError|MissingParameter|InvalidFormat/i,
  },
];

/**
 * Map an unknown thrown value to a `CloudWatchErrorKind`.
 *
 * Pure and exported so callers can classify without catching a tagged error,
 * and so the mapping is testable without an AWS client.
 */
export function classifyCloudWatchError(error: unknown): CloudWatchErrorKind {
  if (!(error instanceof Error)) {
    return "unknown";
  }

  const tagged = (error as Partial<CloudWatchError>).cloudWatchErrorKind;
  if (tagged) {
    return tagged;
  }

  // Name and message both — `name` is frequently just "Error".
  const haystack = `${error.name} ${error.message}`;
  for (const { kind, match } of ERROR_PATTERNS) {
    if (match.test(haystack)) {
      return kind;
    }
  }

  return "unknown";
}

/** Read the kind off an error thrown by this module. */
export function getCloudWatchErrorKind(error: unknown): CloudWatchErrorKind {
  return classifyCloudWatchError(error);
}

/**
 * Wrap a CloudWatch failure in an error that names what went wrong, keeping
 * the original as `cause` so structured logs still carry the AWS detail.
 */
function cloudWatchError(action: string, error: unknown): CloudWatchError {
  const kind = classifyCloudWatchError(error);
  const detail = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(
    `CloudWatch ${action} failed (${kind}): ${detail}`,
    { cause: error }
  ) as CloudWatchError;
  wrapped.cloudWatchErrorKind = kind;
  return wrapped;
}

/**
 * SES metrics this app reads from CloudWatch.
 *
 * Deliberately only the reputation rates. The count metrics (`Send`,
 * `Delivery`, `Bounce`, `Open`, ...) used to live here too, and every reader of
 * them was wrong in the same way: SES publishes those undimensioned, so they
 * are ACCOUNT-WIDE and include mail sent outside Wraps. Scoping them to the
 * Wraps configuration set is not possible - SES only publishes per-set counts
 * when the set has a CloudWatch event destination, and Wraps deploys an
 * EventBridge destination instead (packages/pulumi/src/resources/ses.ts).
 * Verified against a live Wraps-deployed account: the only `AWS/SES` metrics
 * carrying a `ses:configuration-set` dimension there are `Reputation.*`.
 *
 * Counts come from Postgres `message_send` instead - see
 * `src/lib/analytics-fallback.ts`. Do not add count metrics back here.
 */
export const SES_METRICS = {
  REPUTATION_BOUNCE_RATE: "Reputation.BounceRate",
  REPUTATION_COMPLAINT_RATE: "Reputation.ComplaintRate",
} as const;

/**
 * Fetches SES account-level reputation rates from CloudWatch.
 *
 * SES publishes Reputation.BounceRate and Reputation.ComplaintRate as
 * pre-computed rolling averages — these are the exact values shown in the
 * SES console and used for enforcement decisions. They cover the account's
 * full send history, not just a user-selected period.
 *
 * Returns decimal rates (0–1). Multiply by 100 for percentages.
 * Returns null for each metric if SES hasn't published data yet (new accounts).
 */
export async function getSESReputationMetrics(
  awsAccountId: string
): Promise<{ bounceRate: number | null; complaintRate: number | null }> {
  const account = await db.query.awsAccount.findFirst({
    where: (a, { eq }) => eq(a.id, awsAccountId),
  });

  if (!account) {
    throw new Error("AWS account not found");
  }

  const credentials = await getOrAssumeRole({
    roleArn: account.roleArn,
    externalId: account.externalId,
    region: account.region,
  });

  const cloudwatch = new CloudWatchClient({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Query the last 7 days to ensure we get a data point even if SES publishes
  // infrequently. Use Average because these are rate values (0–1), not counts.
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  const command = new GetMetricDataCommand({
    MetricDataQueries: [
      {
        Id: "bounce_rate",
        MetricStat: {
          Metric: {
            Namespace: "AWS/SES",
            MetricName: SES_METRICS.REPUTATION_BOUNCE_RATE,
          },
          Period: 86_400,
          Stat: "Average",
        },
      },
      {
        Id: "complaint_rate",
        MetricStat: {
          Metric: {
            Namespace: "AWS/SES",
            MetricName: SES_METRICS.REPUTATION_COMPLAINT_RATE,
          },
          Period: 86_400,
          Stat: "Average",
        },
      },
    ],
    StartTime: startTime,
    EndTime: endTime,
  });

  let response: GetMetricDataCommandOutput;
  try {
    response = await cloudwatch.send(command);
  } catch (error) {
    throw cloudWatchError("GetMetricData(Reputation)", error);
  }
  const results = response.MetricDataResults || [];

  const latestValue = (id: string): number | null => {
    const result = results.find((r) => r.Id === id);
    const values = result?.Values;
    return values && values.length > 0 ? (values[0] ?? null) : null;
  };

  return {
    bounceRate: latestValue("bounce_rate"),
    complaintRate: latestValue("complaint_rate"),
  };
}
