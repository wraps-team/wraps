import { randomUUID } from "node:crypto";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { Context, S3Event } from "aws-lambda";
import { simpleParser } from "mailparser";
import {
  type DecodedReplyToken,
  decodeReplyToken,
  type ReplyTokenStatus,
  verifyReplyToken,
} from "../../src/reply-token.js";

const awsDefaults = {
  requestHandler: new NodeHttpHandler({
    requestTimeout: 10_000,
    connectionTimeout: 5000,
  }),
  maxAttempts: 5,
};

const s3 = new S3Client(awsDefaults);
const eventbridge = new EventBridgeClient(awsDefaults);
const ssm = new SSMClient(awsDefaults);

const BUCKET_NAME = process.env.BUCKET_NAME!;
const INBOUND_EVENT_SOURCE =
  process.env.INBOUND_EVENT_SOURCE || "wraps.inbound";

/** Max HTML size in EventBridge detail (200KB) */
const MAX_HTML_SIZE = 200 * 1024;

const EMAIL_RECEIVED_DETAIL_TYPE = "email.received";

/**
 * EventBridge PutEvents size limits. AWS raised the limit from 256 KB to
 * 1 MB on 2026-01-29 ("the total request size … must be less than 1 MB
 * (1,048,576 bytes)"), except in the Regions listed below, which keep the
 * old 256 KB limit. GovCloud was not part of that announcement.
 * https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-putevents.html#eb-putevent-size
 * https://aws.amazon.com/about-aws/whats-new/2026/01/amazon-eventbridge-increases-event-payload-size-256-kb-1-mb
 */
const EVENTBRIDGE_LIMIT_BYTES = 1024 * 1024;
const EVENTBRIDGE_LEGACY_LIMIT_BYTES = 256 * 1024;
const LEGACY_LIMIT_REGIONS = new Set([
  "ap-southeast-5", // Asia Pacific (Malaysia)
  "ap-southeast-6", // Asia Pacific (New Zealand)
  "ap-southeast-7", // Asia Pacific (Thailand)
  "ap-east-2", // Asia Pacific (Taipei)
  "mx-central-1", // Mexico (Central)
]);
/** Headroom below the hard limit, so the entry is strictly smaller. */
const EVENT_SIZE_MARGIN_BYTES = 1024;

/** Longest subject kept in the minimal fallback detail. */
const MAX_FALLBACK_SUBJECT_LENGTH = 1000;

export function maxEventEntryBytes(
  region = process.env.AWS_REGION ?? ""
): number {
  const limit =
    LEGACY_LIMIT_REGIONS.has(region) || region.startsWith("us-gov-")
      ? EVENTBRIDGE_LEGACY_LIMIT_BYTES
      : EVENTBRIDGE_LIMIT_BYTES;
  return limit - EVENT_SIZE_MARGIN_BYTES;
}

/**
 * Size of a PutEvents entry as EventBridge counts it: the UTF-8 bytes of
 * Source, DetailType and Detail (no Time or Resources are sent).
 */
export function putEventsEntrySize(entry: {
  Source: string;
  DetailType: string;
  Detail: string;
}): number {
  return (
    Buffer.byteLength(entry.Source, "utf8") +
    Buffer.byteLength(entry.DetailType, "utf8") +
    Buffer.byteLength(entry.Detail, "utf8")
  );
}

type TrimmableEmail = {
  emailId: string;
  messageId: string;
  receivingDomain: string | null;
  from: unknown;
  to: unknown[];
  cc: unknown[];
  subject: string;
  date: string;
  html: string | null;
  htmlTruncated: boolean;
  text: string | null;
  headers: Record<string, unknown>;
  attachments: unknown[];
  spamVerdict: unknown;
  virusVerdict: unknown;
  rawS3Key: string;
  receivedAt: string;
  replyToken: unknown;
  autoReply: boolean;
};

/**
 * Build the `email.received` Detail string so the entry fits under `maxBytes`.
 *
 * If the full parsed email fits, it is sent unchanged. Otherwise the large
 * fields are dropped one at a time until it fits:
 *   1. html, text and headers, largest first
 *      (html → null with htmlTruncated: true, text → null, headers → {})
 *   2. attachments → [] (attachmentCount keeps the number)
 *   3. to/cc → [] (toCount/ccCount kept), subject cut to 1000 characters
 *   4. last resort ("envelope"): only emailId, rawS3Key, parsedS3Key,
 *      receivedAt, replyToken and autoReply, which are all bounded
 * Ties keep the html, text, headers order; fields that are already empty
 * are skipped. A trimmed detail carries
 * `truncated: true`, `truncatedFields`, and `parsedS3Key`, the key of the
 * full parsed JSON in the same bucket as `rawS3Key`.
 */
export function buildEventDetail(
  email: TrimmableEmail,
  parsedS3Key: string,
  source: string,
  maxBytes: number
): { detail: string; truncatedFields: string[]; fullBytes: number } {
  const sizeOf = (candidate: string) =>
    putEventsEntrySize({
      Source: source,
      DetailType: EMAIL_RECEIVED_DETAIL_TYPE,
      Detail: candidate,
    });

  const full = JSON.stringify(email);
  const fullBytes = sizeOf(full);
  if (fullBytes <= maxBytes) {
    return { detail: full, truncatedFields: [], fullBytes };
  }

  const truncatedFields: string[] = [];
  const trimmed: Record<string, unknown> = {
    ...email,
    truncated: true,
    truncatedFields,
    parsedS3Key,
  };
  const bodySteps: [string, number, () => void][] = [
    [
      "html",
      Buffer.byteLength(JSON.stringify(email.html), "utf8"),
      () => {
        trimmed.html = null;
        trimmed.htmlTruncated = true;
      },
    ],
    [
      "text",
      Buffer.byteLength(JSON.stringify(email.text), "utf8"),
      () => {
        trimmed.text = null;
      },
    ],
    [
      "headers",
      Buffer.byteLength(JSON.stringify(email.headers), "utf8"),
      () => {
        trimmed.headers = {};
      },
    ],
  ];
  const present: Record<string, boolean> = {
    html: email.html !== null,
    text: email.text !== null,
    headers: Object.keys(email.headers).length > 0,
  };
  // Stable sort: equal sizes keep the html, text, headers order. Fields
  // that are already empty are skipped so they are not reported as dropped.
  bodySteps.sort((a, b) => b[1] - a[1]);
  const steps: [string, () => void][] = [
    ...bodySteps
      .filter(([field]) => present[field])
      .map(([field, , drop]): [string, () => void] => [field, drop]),
    [
      "attachments",
      () => {
        trimmed.attachmentCount = email.attachments.length;
        trimmed.attachments = [];
      },
    ],
    [
      "recipients",
      () => {
        trimmed.toCount = email.to.length;
        trimmed.ccCount = email.cc.length;
        trimmed.to = [];
        trimmed.cc = [];
        trimmed.subject = email.subject.slice(0, MAX_FALLBACK_SUBJECT_LENGTH);
      },
    ],
  ];

  let detail = JSON.stringify(trimmed);
  for (const [field, drop] of steps) {
    if (sizeOf(detail) <= maxBytes) {
      break;
    }
    drop();
    truncatedFields.push(field);
    detail = JSON.stringify(trimmed);
  }

  // Sender-controlled fields that are left (from.name, messageId, verdict
  // headers) are unbounded. If they alone are too big, send an envelope of
  // bounded fields only, so the event can never exceed the limit.
  if (sizeOf(detail) > maxBytes) {
    truncatedFields.push("envelope");
    detail = JSON.stringify({
      emailId: email.emailId,
      rawS3Key: email.rawS3Key,
      parsedS3Key,
      receivedAt: email.receivedAt,
      replyToken: email.replyToken,
      autoReply: email.autoReply,
      truncated: true,
      truncatedFields,
    });
  }
  return { detail, truncatedFields, fullBytes };
}

type CachedSecret = {
  kid: number;
  current: Buffer;
  previous?: Buffer;
  /** kid of the `previous` secret. If absent, falls back to `kid - 1`. */
  previousKid?: number;
  fetchedAt: number;
};

const SECRET_CACHE_TTL_MS = 5 * 60 * 1000;
const domainSecretCache = new Map<string, CachedSecret>();

// Well-formed DNS label per RFC 1035: lowercase a-z, 0-9, hyphen (not at
// start/end), 2+ labels separated by dots. Prevents SSM path injection via
// malformed recipient hostnames.
const DOMAIN_REGEX =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253 || domain.includes("..")) {
    return false;
  }
  return DOMAIN_REGEX.test(domain.toLowerCase());
}

type ReplyTokenEvent =
  | {
      conversationId: string;
      sendId: string;
      status: "valid";
    }
  | {
      conversationId: null;
      sendId: null;
      status: Exclude<ReplyTokenStatus, "valid">;
    };

async function getReplySecretForDomain(
  domain: string
): Promise<CachedSecret | null> {
  const prefix = process.env.REPLY_SECRET_PARAMETER_PREFIX;
  if (!prefix) {
    return null;
  }
  if (!isValidDomain(domain)) {
    return null;
  }
  const now = Date.now();
  const cached = domainSecretCache.get(domain);
  if (cached && now - cached.fetchedAt < SECRET_CACHE_TTL_MS) {
    return cached;
  }
  try {
    const res = await ssm.send(
      new GetParameterCommand({
        Name: prefix + domain,
        WithDecryption: true,
      })
    );
    const value = res.Parameter?.Value;
    if (!value) {
      return null;
    }
    let parsed: {
      kid: number;
      current: string;
      previous?: string;
      previousKid?: number;
    };
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
    if (
      !parsed ||
      typeof parsed.kid !== "number" ||
      typeof parsed.current !== "string"
    ) {
      return null;
    }
    const entry: CachedSecret = {
      kid: parsed.kid,
      current: Buffer.from(parsed.current, "base64"),
      previous:
        typeof parsed.previous === "string"
          ? Buffer.from(parsed.previous, "base64")
          : undefined,
      previousKid:
        typeof parsed.previousKid === "number" ? parsed.previousKid : undefined,
      fetchedAt: now,
    };
    domainSecretCache.set(domain, entry);
    return entry;
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === "ParameterNotFound") {
      return null;
    }
    throw error;
  }
}

type RecipientAddr = { address: string };

function findReplyRecipient(
  headers: Record<string, unknown>,
  toAddresses: RecipientAddr[],
  ccAddresses: RecipientAddr[]
): { address: string; replyDomain: string; sendingDomain: string } | null {
  const xOriginalTo =
    typeof headers["x-original-to"] === "string"
      ? (headers["x-original-to"] as string).trim()
      : null;
  const candidates: string[] = xOriginalTo
    ? [xOriginalTo]
    : [
        ...toAddresses.map((a) => a.address),
        ...ccAddresses.map((a) => a.address),
      ];
  for (const addr of candidates) {
    if (!addr) {
      continue;
    }
    const at = addr.lastIndexOf("@");
    if (at < 1) {
      continue;
    }
    const host = addr.slice(at + 1).toLowerCase();
    if (host.startsWith("r.mail.")) {
      return {
        address: addr,
        replyDomain: host,
        sendingDomain: host.slice("r.mail.".length),
      };
    }
  }
  return null;
}

function buildSecretsMap(cached: CachedSecret): Record<number, Buffer> {
  const out: Record<number, Buffer> = { [cached.kid]: cached.current };
  if (cached.previous) {
    const prevKid = cached.previousKid ?? cached.kid - 1;
    out[prevKid] = cached.previous;
  }
  return out;
}

function detectAutoReply(headers: Record<string, unknown>): boolean {
  const autoSubmitted =
    typeof headers["auto-submitted"] === "string"
      ? (headers["auto-submitted"] as string).toLowerCase()
      : "";
  if (autoSubmitted && autoSubmitted !== "no") {
    return true;
  }
  const precedence =
    typeof headers.precedence === "string"
      ? (headers.precedence as string).toLowerCase()
      : "";
  if (precedence === "bulk" || precedence === "auto_reply") {
    return true;
  }
  if ("x-autoreply" in headers || "x-autorespond" in headers) {
    return true;
  }
  return false;
}

/**
 * Lambda handler for processing inbound emails from S3 (via SES Receipt Rule)
 *
 * Flow:
 * 1. SES receives email → stores raw MIME in S3 (raw/{messageId})
 * 2. S3 notification triggers this Lambda
 * 3. Parse MIME → extract headers, body, attachments
 * 4. Store attachments → S3 (attachments/{emailId}/{attId}-{filename})
 * 5. Store parsed JSON → S3 (parsed/{emailId}.json)
 * 6. Put event → EventBridge (source: "wraps.inbound", detail-type: "email.received").
 *    If the full parsed email does not fit the PutEvents size limit, the
 *    detail is trimmed (see buildEventDetail) and points at parsed/{emailId}.json.
 */
export async function handler(event: S3Event, context: Context) {
  const requestId = context.awsRequestId;
  const batchId = randomUUID().slice(0, 8);

  const log = (msg: string, data?: Record<string, unknown>) => {
    console.info(JSON.stringify({ requestId, batchId, msg, ...data }));
  };
  const logError = (
    msg: string,
    error: unknown,
    data?: Record<string, unknown>
  ) => {
    console.error(
      JSON.stringify({
        requestId,
        batchId,
        msg,
        error: String(error),
        ...data,
      })
    );
  };

  log("Processing inbound email batch", {
    recordCount: event.Records.length,
  });

  for (const record of event.Records) {
    const s3Key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const bucket = record.s3.bucket.name;

    try {
      log("Processing raw email", { bucket, key: s3Key });

      // 1. Read raw MIME from S3
      const rawResponse = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: s3Key })
      );
      const rawBody = await rawResponse.Body?.transformToString();
      if (!rawBody) {
        throw new Error(`Empty or missing S3 object body: ${bucket}/${s3Key}`);
      }

      // 2. Parse MIME
      const parsed = await simpleParser(rawBody);

      // Generate email ID
      const emailId = `inb_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

      // 3. Extract headers as key-value pairs
      // mailparser returns most headers as strings, but some (list, received,
      // references) are complex objects. We preserve objects as-is so downstream
      // consumers can access nested fields like list.unsubscribe.
      const headers: Record<string, unknown> = {};
      if (parsed.headers) {
        for (const [key, value] of parsed.headers) {
          let headerValue: unknown;
          if (typeof value === "string") {
            headerValue = value;
          } else if (
            typeof value === "object" &&
            value !== null &&
            "text" in value
          ) {
            headerValue = (value as { text: string }).text;
          } else if (typeof value === "object" && value !== null) {
            // Preserve nested objects (e.g. list.unsubscribe, list.post)
            headerValue = value;
          } else {
            headerValue = String(value);
          }

          if (headers[key] != null) {
            // Multiple values for same header — combine strings, keep first object
            if (
              typeof headers[key] === "string" &&
              typeof headerValue === "string"
            ) {
              headers[key] = `${headers[key]}, ${headerValue}`;
            }
          } else {
            headers[key] = headerValue;
          }
        }
      }

      // 4. Extract SES spam/virus verdicts from headers
      const spamVerdict = headers["x-ses-spam-verdict"] || null;
      const virusVerdict = headers["x-ses-virus-verdict"] || null;

      // 5. Upload attachments to S3
      const attachments: Array<{
        id: string;
        filename: string;
        contentType: string;
        size: number;
        s3Key: string;
        contentDisposition: string;
        cid: string | null;
      }> = [];

      if (parsed.attachments && parsed.attachments.length > 0) {
        for (let i = 0; i < parsed.attachments.length; i++) {
          const att = parsed.attachments[i];
          const attId = `att_${i}`;
          const safeFilename = (att.filename || `attachment_${i}`).replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
          );
          const attKey = `attachments/${emailId}/${attId}-${safeFilename}`;

          await s3.send(
            new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: attKey,
              Body: att.content,
              ContentType: att.contentType || "application/octet-stream",
            })
          );

          attachments.push({
            id: attId,
            filename: att.filename || `attachment_${i}`,
            contentType: att.contentType || "application/octet-stream",
            size: att.size,
            s3Key: attKey,
            contentDisposition: att.contentDisposition || "attachment",
            cid: att.cid || null,
          });
        }
      }

      // 6. Build parsed email JSON
      let html = parsed.html || null;
      let htmlTruncated = false;

      if (html && html.length > MAX_HTML_SIZE) {
        html = html.slice(0, MAX_HTML_SIZE);
        htmlTruncated = true;
      }

      const toAddresses = parsed.to
        ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
            .flatMap((addr) => ("value" in addr ? addr.value : [addr]))
            .map((a) => ({
              address: a.address || "",
              name: a.name || "",
            }))
        : [];

      const ccAddresses = parsed.cc
        ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
            .flatMap((addr) => ("value" in addr ? addr.value : [addr]))
            .map((a) => ({
              address: a.address || "",
              name: a.name || "",
            }))
        : [];

      const fromAddress = parsed.from?.value?.[0]
        ? {
            address: parsed.from.value[0].address || "",
            name: parsed.from.value[0].name || "",
          }
        : { address: "", name: "" };

      // Prefer X-Original-To for recipient derivation (SES envelope),
      // then fall back to scanning To + CC for r.mail.* recipients.
      const replyRecipient = findReplyRecipient(
        headers,
        toAddresses,
        ccAddresses
      );

      const receivingDomain =
        replyRecipient?.replyDomain ||
        toAddresses[0]?.address?.split("@")[1] ||
        null;

      let replyToken: ReplyTokenEvent | null = null;
      let cacheHit = false;
      const replyThreadingEnabled = Boolean(
        process.env.REPLY_SECRET_PARAMETER_PREFIX
      );
      if (replyRecipient && replyThreadingEnabled) {
        const localPart = replyRecipient.address.slice(
          0,
          replyRecipient.address.lastIndexOf("@")
        );
        const decoded: DecodedReplyToken | null = decodeReplyToken(localPart);
        if (decoded) {
          const beforeCache = domainSecretCache.get(
            replyRecipient.sendingDomain
          );
          const cached = await getReplySecretForDomain(
            replyRecipient.sendingDomain
          );
          cacheHit = beforeCache !== undefined && cached !== null;
          if (cached) {
            const verified = verifyReplyToken(
              decoded,
              buildSecretsMap(cached),
              Math.floor(Date.now() / 1000)
            );
            replyToken =
              verified.status === "valid"
                ? {
                    status: "valid",
                    conversationId: verified.conversationId,
                    sendId: verified.sendId,
                  }
                : {
                    status: verified.status,
                    conversationId: null,
                    sendId: null,
                  };
          } else {
            replyToken = {
              status: "unknown-domain",
              conversationId: null,
              sendId: null,
            };
          }
        } else {
          replyToken = {
            status: "malformed",
            conversationId: null,
            sendId: null,
          };
        }
      }

      const autoReply = detectAutoReply(headers);

      const parsedEmail = {
        emailId,
        messageId: parsed.messageId || s3Key.replace("raw/", ""),
        receivingDomain,
        from: fromAddress,
        to: toAddresses,
        cc: ccAddresses,
        subject: parsed.subject || "",
        date: parsed.date?.toISOString() || new Date().toISOString(),
        html,
        htmlTruncated,
        text: parsed.text || null,
        headers,
        attachments,
        spamVerdict,
        virusVerdict,
        rawS3Key: s3Key,
        receivedAt: new Date().toISOString(),
        replyToken,
        autoReply,
      };

      // 7. Store parsed JSON at parsed/{emailId}.json
      const parsedS3Key = `parsed/${emailId}.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: parsedS3Key,
          Body: JSON.stringify(parsedEmail),
          ContentType: "application/json",
        })
      );

      log("Stored parsed email", {
        emailId,
        attachmentCount: attachments.length,
      });

      // 8. Put event to EventBridge, trimmed to fit the PutEvents size limit
      const maxBytes = maxEventEntryBytes();
      const { detail, truncatedFields, fullBytes } = buildEventDetail(
        parsedEmail,
        parsedS3Key,
        INBOUND_EVENT_SOURCE,
        maxBytes
      );
      if (truncatedFields.length > 0) {
        log("Trimmed email.received detail to fit EventBridge limit", {
          emailId,
          fullBytes,
          trimmedBytes: putEventsEntrySize({
            Source: INBOUND_EVENT_SOURCE,
            DetailType: EMAIL_RECEIVED_DETAIL_TYPE,
            Detail: detail,
          }),
          maxBytes,
          truncatedFields,
          parsedS3Key,
        });
      }

      const putResult = await eventbridge.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: INBOUND_EVENT_SOURCE,
              DetailType: EMAIL_RECEIVED_DETAIL_TYPE,
              Detail: detail,
            },
          ],
        })
      );

      // PutEvents reports per-entry failures in a 200 response, so a
      // failed entry must be surfaced explicitly to trigger a retry.
      if ((putResult.FailedEntryCount ?? 0) > 0) {
        const failed = (putResult.Entries ?? []).find((e) => e.ErrorCode);
        throw new Error(
          `EventBridge PutEvents failed for ${emailId}: ${failed?.ErrorCode ?? "UnknownError"} ${failed?.ErrorMessage ?? ""}`.trim()
        );
      }

      log("Processed inbound", {
        emailId,
        sendingDomain: replyRecipient?.sendingDomain ?? null,
        replyTokenStatus: replyToken?.status ?? null,
        autoReply,
        cacheHit,
      });
    } catch (error) {
      logError("Error processing inbound email", error, { s3Key });
      // Re-throw to trigger Lambda retry / DLQ
      throw error;
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Inbound emails processed" }),
  };
}
