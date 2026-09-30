import { describe, expect, it } from "vitest";
import {
  extractDomain,
  organizationalDomain,
  parseEmailHeaders,
  unfoldHeaders,
} from "@/lib/email-headers";

// Hand-written blocks on reserved example domains and documentation IPs.

const SES_PASSING = [
  "Return-Path: <0102abc-def@mail.example.com>",
  "Received: from mail.example.com (mail.example.com [192.0.2.10])",
  " by mx.receiver.test with ESMTPS id x1y2z3",
  " for <user@receiver.test>; Tue, 01 Sep 2026 10:00:05 +0000",
  "Received: from a1-2.smtp-out.amazonses.com (a1-2.smtp-out.amazonses.com [198.51.100.7])",
  " by mail.example.com with SMTP id q9w8e7; Tue, 01 Sep 2026 10:00:02 +0000",
  "Authentication-Results: mx.receiver.test;",
  "  spf=pass (receiver.test: domain of bounce@mail.example.com designates 198.51.100.7) smtp.mailfrom=bounce@mail.example.com;",
  "  dkim=pass header.d=example.com header.s=abc;",
  "  dmarc=pass (p=REJECT) header.from=example.com",
  "From: Example <hello@example.com>",
  "Subject: Welcome aboard",
  "Date: Tue, 01 Sep 2026 10:00:01 +0000",
  "Message-ID: <0102abc@email.amazonses.com>",
  "X-SES-Outgoing: 2026.09.01-198.51.100.7",
  "Feedback-ID: 1.us-east-1.abc:AmazonSES",
  "",
  "Body text that must be ignored: spf=fail",
].join("\n");

const SPF_FAIL = [
  "Received: from unknown (unknown [203.0.113.9])",
  " by mx.receiver.test with ESMTP; Wed, 02 Sep 2026 08:15:00 +0000",
  "Authentication-Results: mx.receiver.test;",
  "  spf=fail smtp.mailfrom=news@shop.example.org;",
  "  dkim=none;",
  "  dmarc=fail header.from=shop.example.org",
  "Return-Path: <news@shop.example.org>",
  "From: Shop <news@shop.example.org>",
  "Subject: Sale",
].join("\r\n");

const MISALIGNED = [
  "Return-Path: <bounce-123@bounces.esp-mail.test>",
  "Authentication-Results: mx.receiver.test;",
  "  spf=pass smtp.mailfrom=bounces.esp-mail.test;",
  "  dkim=pass header.d=esp-mail.test;",
  "  dmarc=fail header.from=brand.example",
  "From: Brand <team@brand.example>",
  "X-Mailgun-Sending-Ip: 192.0.2.44",
  "X-SG-EID: abc",
  "X-PM-Message-Id: 11111111",
  "X-Google-Smtp-Source: abc",
].join("\n");

describe("unfoldHeaders", () => {
  it("joins continuation lines and stops at the first blank line", () => {
    const fields = unfoldHeaders(
      "Subject: one\n two\n\tthree\nX-A: b\n\nX-C: d"
    );
    expect(fields).toEqual([
      { name: "Subject", value: "one two three" },
      { name: "X-A", value: "b" },
    ]);
  });
});

describe("SES-sent passing message", () => {
  const parsed = parseEmailHeaders(SES_PASSING);

  it("lists Received hops oldest first with the delay between them", () => {
    expect(parsed.received).toHaveLength(2);
    expect(parsed.received[0]?.by).toBe("mail.example.com");
    expect(parsed.received[0]?.from).toBe("a1-2.smtp-out.amazonses.com");
    expect(parsed.received[0]?.delaySeconds).toBeNull();
    expect(parsed.received[1]?.by).toBe("mx.receiver.test");
    expect(parsed.received[1]?.protocol).toBe("ESMTPS");
    expect(parsed.received[1]?.delaySeconds).toBe(3);
  });

  it("breaks out SPF, DKIM and DMARC with their domains", () => {
    expect(parsed.auth).toEqual([
      {
        method: "spf",
        result: "pass",
        domain: "mail.example.com",
        reportedBy: "mx.receiver.test",
      },
      {
        method: "dkim",
        result: "pass",
        domain: "example.com",
        reportedBy: "mx.receiver.test",
      },
      {
        method: "dmarc",
        result: "pass",
        domain: "example.com",
        reportedBy: "mx.receiver.test",
      },
    ]);
  });

  it("reads the plain fields", () => {
    expect(parsed.subject).toBe("Welcome aboard");
    expect(parsed.messageId).toBe("<0102abc@email.amazonses.com>");
    expect(parsed.from).toBe("Example <hello@example.com>");
  });

  it("calls a subdomain Return-Path aligned but not exact", () => {
    expect(parsed.alignment).toEqual({
      returnPathDomain: "mail.example.com",
      fromDomain: "example.com",
      aligned: true,
      exact: false,
    });
  });

  it("claims Amazon SES once, from the headers that are present", () => {
    expect(parsed.platforms).toEqual(["Amazon SES"]);
  });

  it("does not read the body", () => {
    expect(parsed.auth.filter((a) => a.method === "spf")).toHaveLength(1);
  });
});

describe("failing SPF message", () => {
  const parsed = parseEmailHeaders(SPF_FAIL);

  it("reports the failures and the domain", () => {
    const spf = parsed.auth.find((a) => a.method === "spf");
    expect(spf).toMatchObject({ result: "fail", domain: "shop.example.org" });
    expect(parsed.auth.find((a) => a.method === "dkim")?.result).toBe("none");
    expect(parsed.auth.find((a) => a.method === "dmarc")?.result).toBe("fail");
  });

  it("parses a single hop with CRLF line endings", () => {
    expect(parsed.received).toHaveLength(1);
    expect(parsed.received[0]?.delaySeconds).toBeNull();
    expect(parsed.platforms).toEqual([]);
  });

  it("is exactly aligned", () => {
    expect(parsed.alignment).toMatchObject({ aligned: true, exact: true });
  });
});

describe("misaligned Return-Path", () => {
  const parsed = parseEmailHeaders(MISALIGNED);

  it("flags the ESP bounce domain as not aligned with From", () => {
    expect(parsed.alignment).toEqual({
      returnPathDomain: "bounces.esp-mail.test",
      fromDomain: "brand.example",
      aligned: false,
      exact: false,
    });
  });

  it("shows SPF and DKIM passing while DMARC fails", () => {
    expect(parsed.auth.map((a) => `${a.method}=${a.result}`)).toEqual([
      "spf=pass",
      "dkim=pass",
      "dmarc=fail",
    ]);
    expect(parsed.auth[0]?.domain).toBe("bounces.esp-mail.test");
  });

  it("names each sending platform whose header is present", () => {
    expect(parsed.platforms).toEqual([
      "Mailgun",
      "SendGrid",
      "Postmark",
      "Google",
    ]);
  });
});

describe("delay handling", () => {
  it("skips the delay when a Received date does not parse", () => {
    const parsed = parseEmailHeaders(
      [
        "Received: by b.test; not a date at all",
        "Received: by a.test; Tue, 01 Sep 2026 10:00:00 +0000",
      ].join("\n")
    );
    expect(parsed.received).toHaveLength(2);
    expect(parsed.received[0]?.date).not.toBeNull();
    expect(parsed.received[1]?.date).toBeNull();
    expect(parsed.received[1]?.delaySeconds).toBeNull();
  });
});

describe("malformed input", () => {
  const empty = {
    fields: [],
    received: [],
    auth: [],
    from: null,
    returnPath: null,
    messageId: null,
    subject: null,
    date: null,
    platforms: [],
  };

  it("returns an empty result for an empty string", () => {
    expect(parseEmailHeaders("")).toMatchObject(empty);
  });

  it("returns an empty result for random text without throwing", () => {
    const parsed = parseEmailHeaders("hello there\nthis is not a header block");
    expect(parsed).toMatchObject(empty);
    expect(parsed.alignment.aligned).toBeNull();
  });

  it("does not claim a platform when the header is absent", () => {
    expect(parseEmailHeaders("Subject: hi\nFrom: a@b.test").platforms).toEqual(
      []
    );
  });
});

describe("domain helpers", () => {
  it("extracts the domain from bracketed and bare addresses", () => {
    expect(extractDomain("Name <A@Example.COM>")).toBe("example.com");
    expect(extractDomain("a@example.com")).toBe("example.com");
    expect(extractDomain("<>")).toBeNull();
    expect(extractDomain(null)).toBeNull();
  });

  it("uses the last two labels as the organizational domain heuristic", () => {
    expect(organizationalDomain("mail.example.com")).toBe("example.com");
    expect(organizationalDomain("example.com")).toBe("example.com");
  });
});
