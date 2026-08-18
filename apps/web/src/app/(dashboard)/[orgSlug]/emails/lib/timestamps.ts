/**
 * Timestamp formatting for the emails surface (audit finding F15).
 *
 * The list showed only relative times ("3d ago", "Yesterday") and the detail
 * page had the absolute formatter, so incident work meant opening a message to
 * learn when it happened. Both pages now format from here, which also stops the
 * three copies of the same `toLocaleString` call from drifting apart.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** "Mon, Aug 18, 2026 at 2:03:11 PM" - exact, for hover and screen readers. */
export function formatFullTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/** "Aug 18, 2:03 PM" - enough for a timeline row. */
export function formatShortTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "2:03 PM" / "Yesterday" / "3d ago" / "Aug 18" - a table cell's worth. */
export function formatRelativeTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const diffInDays = Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);

  if (diffInDays === 0) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  if (diffInDays === 1) {
    return "Yesterday";
  }
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** "today" / "yesterday" / "Aug 18" - the subject cell's send-date sub-line. */
export function formatSentDate(timestamp: number): string {
  const date = new Date(timestamp);
  const diffInDays = Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);

  if (diffInDays === 0) {
    return "today";
  }
  if (diffInDays === 1) {
    return "yesterday";
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
