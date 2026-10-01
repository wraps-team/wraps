export type StructuredLogger = {
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, error?: unknown, data?: Record<string, unknown>) => void;
};

/** Structural subset of pino.Logger — no pino import. */
export type PinoLike = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
};

export function fromPino(logger: PinoLike): StructuredLogger {
  return {
    info: (msg, data) => logger.info(data ?? {}, msg),
    warn: (msg, data) => logger.warn(data ?? {}, msg),
    error: (msg, error, data) => {
      if (error === undefined) {
        logger.error(data ?? {}, msg);
        return;
      }
      logger.error({ err: error, ...data }, msg);
    },
  };
}
