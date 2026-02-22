export function compact<T extends Record<string, unknown>>(
  obj: T
): { [K in keyof T]: Exclude<T[K], null> } {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      result[key] = value;
    }
  }
  return result as { [K in keyof T]: Exclude<T[K], null> };
}

export function toISO(date: Date): string {
  return date.toISOString();
}

export function fromISO(iso: string): Date {
  return new Date(iso);
}

export function toDateOrUndefined(
  value: string | undefined | null
): Date | undefined {
  return value ? new Date(value) : undefined;
}

export function toBinaryOrUndefined(
  value: Uint8Array | undefined | null
): Uint8Array | undefined {
  return value ?? undefined;
}
