"use client";

import { format } from "date-fns";
import { useEffect, useState } from "react";

/** Formats a timestamp in the viewer's time zone. The detail page is a server
 *  component, so formatting there used the server's zone (UTC on Vercel) and a
 *  broadcast scheduled for 7:00 AM in Denver read as 1:00 PM. Formatting waits
 *  for mount so the server and client markup agree. */
export function LocalDateTime({
  value,
  showTimeZone = false,
}: {
  value: string;
  showTimeZone?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const date = new Date(value);
    const formatted = format(date, "PPp");
    setText(showTimeZone ? `${formatted} ${timeZoneName(date)}` : formatted);
  }, [value, showTimeZone]);

  return <time dateTime={value}>{text}</time>;
}

function timeZoneName(date: Date): string {
  try {
    return (
      new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}
