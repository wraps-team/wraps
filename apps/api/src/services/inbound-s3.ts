/**
 * Inbound email reads from the customer's own S3 bucket.
 *
 * Port of apps/web/src/lib/aws/s3-inbound.ts (listInboundEmails,
 * getInboundEmail). Nothing is stored in Wraps' database; every read goes to
 * the customer's inbound bucket through an assumed role.
 *
 * Differences from the dashboard copy, on purpose:
 * - The AWS account is looked up with `organizationId` in the same query. The
 *   dashboard looks it up by id only and relies on the caller passing an
 *   org-scoped id.
 * - Credentials come from getCredentials(id, organizationId), which scopes the
 *   account lookup by org before any role is assumed.
 * - Each summary and detail is built field by field. The dashboard returns the
 *   parsed JSON as-is, which includes fields the API does not expose
 *   (replyToken, autoReply, receivingDomain).
 *
 * Pagination: S3 ListObjectsV2 continuation tokens are per bucket, so the
 * opaque cursor carries the account id plus that account's token. A page walks
 * the org's accounts in account-id order and may span several of them.
 */

import {
  type _Object,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { and, awsAccount, db, eq } from "@wraps/db";
import { log } from "../lib/logger";
import { getCredentials } from "./credentials";

const PARSED_PREFIX = "parsed/";

export type InboundAddress = { address: string; name: string };

export type InboundEmailSummary = {
  awsAccountId: string;
  emailId: string;
  from: InboundAddress;
  to: InboundAddress[];
  subject: string;
  receivedAt: string;
  hasAttachments: boolean;
  attachmentCount: number;
  spamVerdict: string | null;
  virusVerdict: string | null;
};

export type InboundAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  s3Key: string;
  contentDisposition: string | null;
  cid: string | null;
};

export type InboundEmailDetail = {
  awsAccountId: string;
  emailId: string;
  messageId: string;
  from: InboundAddress;
  to: InboundAddress[];
  cc: InboundAddress[];
  subject: string;
  date: string;
  html: string | null;
  htmlTruncated: boolean;
  text: string | null;
  headers: Record<string, unknown>;
  attachments: InboundAttachment[];
  spamVerdict: string | null;
  virusVerdict: string | null;
  rawS3Key: string;
  receivedAt: string;
};

/** Stable account order: plain code-unit comparison of the ids. */
function compareIds(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** An org AWS account that has an inbound bucket configured. */
export type InboundAccount = {
  id: string;
  region: string;
  bucketName: string;
};

export type InboundAccountLookup =
  | { ok: true; accounts: InboundAccount[] }
  | { ok: false };

/** The opaque cursor: which account to resume at, and its S3 token. */
export type InboundCursor = { a: string; t: string | null };

export type InboundListPage = {
  data: InboundEmailSummary[];
  nextCursor: string | null;
  deniedAccountIds: string[];
  unreachableAccountIds: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toAddress(value: unknown): InboundAddress {
  const address = isRecord(value) ? value : {};
  return { address: str(address.address), name: str(address.name) };
}

function toAddressList(value: unknown): InboundAddress[] {
  return Array.isArray(value) ? value.map(toAddress) : [];
}

function toAttachment(value: unknown): InboundAttachment {
  const attachment = isRecord(value) ? value : {};
  return {
    id: str(attachment.id),
    filename: str(attachment.filename),
    contentType: str(attachment.contentType),
    size: typeof attachment.size === "number" ? attachment.size : 0,
    s3Key: str(attachment.s3Key),
    contentDisposition: strOrNull(attachment.contentDisposition),
    cid: strOrNull(attachment.cid),
  };
}

function toSummary(
  parsed: Record<string, unknown>,
  awsAccountId: string
): InboundEmailSummary | null {
  if (typeof parsed.emailId !== "string") {
    return null;
  }
  const attachments = Array.isArray(parsed.attachments)
    ? parsed.attachments
    : [];
  return {
    awsAccountId,
    emailId: parsed.emailId,
    from: toAddress(parsed.from),
    to: toAddressList(parsed.to),
    subject: str(parsed.subject),
    receivedAt: str(parsed.receivedAt),
    hasAttachments: attachments.length > 0,
    attachmentCount: attachments.length,
    spamVerdict: strOrNull(parsed.spamVerdict),
    virusVerdict: strOrNull(parsed.virusVerdict),
  };
}

function toDetail(
  parsed: Record<string, unknown>,
  awsAccountId: string
): InboundEmailDetail | null {
  if (typeof parsed.emailId !== "string") {
    return null;
  }
  return {
    awsAccountId,
    emailId: parsed.emailId,
    messageId: str(parsed.messageId),
    from: toAddress(parsed.from),
    to: toAddressList(parsed.to),
    cc: toAddressList(parsed.cc),
    subject: str(parsed.subject),
    date: str(parsed.date),
    html: strOrNull(parsed.html),
    htmlTruncated: parsed.htmlTruncated === true,
    text: strOrNull(parsed.text),
    headers: isRecord(parsed.headers) ? parsed.headers : {},
    attachments: Array.isArray(parsed.attachments)
      ? parsed.attachments.map(toAttachment)
      : [],
    spamVerdict: strOrNull(parsed.spamVerdict),
    virusVerdict: strOrNull(parsed.virusVerdict),
    rawS3Key: str(parsed.rawS3Key),
    receivedAt: str(parsed.receivedAt),
  };
}

/** Opaque cursor: base64url JSON of { a, t }. */
export function encodeInboundCursor(cursor: InboundCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * Strict decode of a client-supplied cursor. Returns null for anything that is
 * not exactly { a: non-empty string, t: string | null }. The caller turns null
 * into a 400: silently starting over would re-list emails already returned.
 */
export function decodeInboundCursor(token: string): InboundCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  if (Object.keys(parsed).some((key) => key !== "a" && key !== "t")) {
    return null;
  }
  const { a, t } = parsed;
  if (typeof a !== "string" || a.length === 0) {
    return null;
  }
  if (t !== null && typeof t !== "string") {
    return null;
  }
  return { a, t };
}

/**
 * The org's AWS accounts that have an inbound bucket, in account-id order.
 * With `awsAccountId`, only that account, and `ok: false` when it is not in
 * this org (the route answers 404; nothing else is read).
 */
export async function loadInboundAccounts(params: {
  organizationId: string;
  awsAccountId?: string;
}): Promise<InboundAccountLookup> {
  const { organizationId, awsAccountId } = params;
  const rows = await db
    .select({
      id: awsAccount.id,
      region: awsAccount.region,
      features: awsAccount.features,
    })
    .from(awsAccount)
    .where(
      awsAccountId === undefined
        ? eq(awsAccount.organizationId, organizationId)
        : and(
            eq(awsAccount.id, awsAccountId),
            eq(awsAccount.organizationId, organizationId)
          )
    );

  if (awsAccountId !== undefined && rows.length === 0) {
    return { ok: false };
  }

  const accounts: InboundAccount[] = [];
  for (const row of rows) {
    const bucketName = row.features?.email?.inboundBucketName;
    if (bucketName) {
      accounts.push({ id: row.id, region: row.region, bucketName });
    }
  }
  accounts.sort((a, b) => compareIds(a.id, b.id));
  return { ok: true, accounts };
}

async function s3For(
  account: InboundAccount,
  organizationId: string
): Promise<S3Client> {
  const credentials = await getCredentials(account.id, organizationId);
  return new S3Client({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "";
}

function isAccessDenied(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "AccessDenied" ||
    error.name === "AccessDeniedException" ||
    error.message.includes("AccessDenied")
  );
}

/** A bucket or key that does not exist reads as "no emails", as on the dashboard. */
function isMissingObject(error: unknown): boolean {
  const name = errorName(error);
  return name === "NoSuchBucket" || name === "NoSuchKey";
}

async function readSummary(
  s3: S3Client,
  account: InboundAccount,
  key: string
): Promise<InboundEmailSummary | null> {
  try {
    const response = await s3.send(
      new GetObjectCommand({ Bucket: account.bucketName, Key: key })
    );
    const body = await response.Body?.transformToString();
    if (!body) {
      return null;
    }
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) ? toSummary(parsed, account.id) : null;
  } catch {
    // The dashboard drops unreadable objects the same way.
    return null;
  }
}

type AccountListing = {
  summaries: InboundEmailSummary[];
  keyCount: number;
  nextToken: string | null;
};

/** One ListObjectsV2 page of one account, read into summaries. */
async function listAccountPage(
  account: InboundAccount,
  organizationId: string,
  maxKeys: number,
  token: string | null
): Promise<AccountListing> {
  const s3 = await s3For(account, organizationId);
  const listed = await s3.send(
    new ListObjectsV2Command({
      Bucket: account.bucketName,
      Prefix: PARSED_PREFIX,
      MaxKeys: maxKeys,
      ContinuationToken: token ?? undefined,
    })
  );
  const contents: _Object[] = listed.Contents ?? [];
  const keys = contents
    .map((object) => object.Key)
    .filter(
      (key): key is string => typeof key === "string" && key.endsWith(".json")
    );
  const summaries = await Promise.all(
    keys.map((key) => readSummary(s3, account, key))
  );
  return {
    summaries: summaries.filter(
      (summary): summary is InboundEmailSummary => summary !== null
    ),
    keyCount: contents.length,
    nextToken: listed.NextContinuationToken ?? null,
  };
}

function recordListFailure(
  page: InboundListPage,
  account: InboundAccount,
  organizationId: string,
  error: unknown
): void {
  if (isMissingObject(error)) {
    return;
  }
  if (isAccessDenied(error)) {
    page.deniedAccountIds.push(account.id);
    return;
  }
  page.unreachableAccountIds.push(account.id);
  log.warn("Failed to list inbound emails for account", {
    awsAccountId: account.id,
    organizationId,
    err: error,
  });
}

/**
 * One page of inbound email summaries across the given accounts.
 *
 * Fills from the cursor's account; when an account has no more keys it moves
 * on with the remaining limit. The page is closed by an S3 continuation token
 * (`NextContinuationToken`), never by a count: the `.json` filter can return
 * fewer objects than MaxKeys while more remain. A cursor for an account that
 * is not in `accounts` returns an empty page.
 */
export async function listInboundEmailPage(params: {
  organizationId: string;
  accounts: InboundAccount[];
  limit: number;
  cursor: InboundCursor | null;
}): Promise<InboundListPage> {
  const { organizationId, accounts, limit, cursor } = params;
  const page: InboundListPage = {
    data: [],
    nextCursor: null,
    deniedAccountIds: [],
    unreachableAccountIds: [],
  };

  const start = cursor
    ? accounts.findIndex((account) => account.id === cursor.a)
    : 0;
  if (start < 0) {
    return page;
  }

  let remaining = limit;
  for (let index = start; index < accounts.length; index++) {
    const account = accounts[index];
    if (remaining <= 0) {
      page.nextCursor = encodeInboundCursor({ a: account.id, t: null });
      return page;
    }
    const token = cursor && index === start ? cursor.t : null;

    try {
      const listing = await listAccountPage(
        account,
        organizationId,
        remaining,
        token
      );
      remaining -= listing.keyCount;
      page.data.push(...listing.summaries);
      if (listing.nextToken) {
        page.nextCursor = encodeInboundCursor({
          a: account.id,
          t: listing.nextToken,
        });
        return page;
      }
    } catch (error) {
      recordListFailure(page, account, organizationId, error);
    }
  }

  return page;
}

/**
 * One parsed inbound email, tried in the given account order. Returns the
 * first account that holds `parsed/<emailId>.json`, or null when none does.
 * Accounts that deny access or cannot be read are skipped and logged.
 */
export async function findInboundEmail(params: {
  organizationId: string;
  accounts: InboundAccount[];
  emailId: string;
}): Promise<InboundEmailDetail | null> {
  const { organizationId, accounts, emailId } = params;

  for (const account of accounts) {
    try {
      const s3 = await s3For(account, organizationId);
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: account.bucketName,
          Key: `${PARSED_PREFIX}${emailId}.json`,
        })
      );
      const body = await response.Body?.transformToString();
      if (!body) {
        continue;
      }
      const parsed: unknown = JSON.parse(body);
      const detail = isRecord(parsed) ? toDetail(parsed, account.id) : null;
      if (detail) {
        return detail;
      }
    } catch (error) {
      if (isMissingObject(error)) {
        continue;
      }
      log.warn("Failed to read inbound email from account", {
        awsAccountId: account.id,
        organizationId,
        accessDenied: isAccessDenied(error),
        err: error,
      });
    }
  }

  return null;
}
