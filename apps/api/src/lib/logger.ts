import { Writable } from "node:stream";
import * as Sentry from "@sentry/aws-serverless";
import pino from "pino";

type LogData = Record<string, unknown>;

const isDev = process.env.NODE_ENV === "development";
const axiomToken = process.env.AXIOM_TOKEN;
const axiomDataset = process.env.AXIOM_DATASET ?? "wraps";

/**
 * In-process Axiom stream — buffers JSON log lines and sends via fetch().
 * No worker threads, no runtime module resolution. Flushed before Lambda returns.
 */
let axiomBuffer: string[] = [];

const axiomStream = new Writable({
  write(chunk, _enc, cb) {
    axiomBuffer.push(chunk.toString().trimEnd());
    cb();
  },
});

async function flushAxiom() {
  if (axiomBuffer.length === 0 || !axiomToken) {
    return;
  }
  const lines = axiomBuffer;
  axiomBuffer = [];
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {}
  }
  if (events.length === 0) {
    return;
  }
  try {
    const res = await fetch(
      `https://api.axiom.co/v1/datasets/${axiomDataset}/ingest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${axiomToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(events),
      }
    );
    if (!res.ok) {
      process.stderr.write(
        `axiom ingest failed: HTTP ${res.status}, dropped ${events.length} events\n`
      );
    }
  } catch (error) {
    process.stderr.write(
      `axiom ingest failed: ${String(error)}, dropped ${events.length} events\n`
    );
  }
}

const pinoLogger = pino(
  {
    level: isDev ? "debug" : "info",
    base: { service: "wraps-api" },
    formatters: { level: (label) => ({ level: label }) },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  axiomToken && !isDev
    ? pino.multistream([{ stream: process.stdout }, { stream: axiomStream }])
    : undefined
);

function serializeError(error: Error): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  if (error.cause instanceof Error) {
    obj.cause = serializeError(error.cause);
  } else if (error.cause !== undefined) {
    obj.cause = String(error.cause);
  }
  return obj;
}

export const log = {
  info(msg: string, data?: LogData) {
    pinoLogger.info(data ?? {}, msg);
  },
  warn(msg: string, data?: LogData) {
    pinoLogger.warn(data ?? {}, msg);
  },
  /**
   * Error-level logs are incidents: they go to Sentry as well as the log sink.
   * Pass `reportToSentry: false` in `data` when the caller reports the failure
   * itself or it is an expected, customer-caused condition (prefer log.warn).
   */
  error(msg: string, error?: unknown, data?: LogData) {
    const { reportToSentry, ...fields } = data ?? {};
    const err =
      error instanceof Error ? serializeError(error) : { error: String(error) };
    pinoLogger.error({ err, ...fields }, msg);
    if (reportToSentry === false) {
      return;
    }
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: { message: msg, ...fields } });
    } else {
      Sentry.captureMessage(msg, {
        level: "error",
        extra: {
          error: error === undefined ? undefined : String(error),
          ...fields,
        },
      });
    }
  },
};

/** Flush pino buffer + send Axiom batch — call before Lambda handler returns */
export async function flushLogger(): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    pinoLogger.flush((err) => (err ? reject(err) : resolve()))
  );
  await flushAxiom();
}
