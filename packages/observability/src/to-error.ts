export function toError(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) {
    return value;
  }
  if (value && typeof value === "object" && "message" in value) {
    const source = value as {
      message: unknown;
      name?: unknown;
      stack?: unknown;
    };
    const error = new Error(String(source.message));
    error.name = String(source.name ?? "Error");
    if (typeof source.stack === "string") {
      error.stack = source.stack;
    }
    return error;
  }
  return new Error(fallbackMessage, { cause: value });
}
