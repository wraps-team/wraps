import { describe, expect, it } from "vitest";
import {
  type CodeTranslation,
  describeBounceSubtype,
  describeComplaintFeedbackType,
  describeEventDiagnostics,
  PROVIDER_PATTERNS,
  translateDiagnosticCode,
} from "./email-diagnostics";

// The reason key written at ingest is provider|code|title (bounce-diagnostics).
function reasonKey(t: CodeTranslation): string {
  return `${t.provider ?? ""}|${t.code ?? ""}|${t.title}`;
}

function copyOf(t: CodeTranslation): string {
  return JSON.stringify([
    t.title,
    t.explanation,
    t.suggestedAction ?? null,
    t.severity,
    t.code ?? null,
    t.provider ?? null,
  ]);
}

// One key must never describe two different translations: if two translations
// share a key, they must share every field, otherwise a stored key would show
// the wrong copy for some rows.
function expectOneCopyPerKey(translations: CodeTranslation[]): void {
  const copyByKey = new Map<string, string>();
  for (const t of translations) {
    const key = reasonKey(t);
    const copy = copyOf(t);
    const prior = copyByKey.get(key);
    if (prior !== undefined && prior !== copy) {
      throw new Error(`reason key "${key}" maps to two different translations`);
    }
    copyByKey.set(key, copy);
  }
}

describe("translateDiagnosticCode — enhanced status codes", () => {
  it("translates a clean status code 5.1.1 to bad-mailbox, permanent", () => {
    const result = translateDiagnosticCode({ status: "5.1.1" });
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Bad destination mailbox address");
    expect(result?.severity).toBe("permanent");
    expect(result?.code).toBe("5.1.1");
  });

  it("parses a raw smtp; DSN prefix to the same enhanced translation", () => {
    const result = translateDiagnosticCode({
      diagnosticCode: "smtp; 550 5.1.1 user unknown",
    });
    expect(result?.title).toBe("Bad destination mailbox address");
    expect(result?.severity).toBe("permanent");
    expect(result?.code).toBe("5.1.1");
  });

  it("folds a 550- continuation to join a reply code to its enhanced code", () => {
    // The reply code (550-) and the enhanced code (5.7.1) are split across the
    // continuation boundary. Only if normalization folds and joins them does the
    // adjacency match yield the specific X.7.1 translation; otherwise it degrades
    // to the generic "Permanent failure" basic-code fallback.
    const result = translateDiagnosticCode({
      diagnosticCode: "smtp; 550-\n5.7.1 delivery refused by recipient",
    });
    expect(result?.title).toBe("Delivery not authorized, message refused");
    expect(result?.severity).toBe("permanent");
    expect(result?.code).toBe("5.7.1");
  });

  it("maps 5.2.2 to mailbox full in a permanent context", () => {
    const result = translateDiagnosticCode({ status: "5.2.2" });
    expect(result?.title).toBe("Mailbox full");
    expect(result?.severity).toBe("permanent");
  });

  it("maps 5.7.1 to a delivery-not-authorized policy block", () => {
    const result = translateDiagnosticCode({ status: "5.7.1" });
    expect(result?.title).toBe("Delivery not authorized, message refused");
    expect(result?.severity).toBe("permanent");
  });

  it("maps 4.4.7 to delivery time expired with transient severity and a retry action", () => {
    const result = translateDiagnosticCode({ status: "4.4.7" });
    expect(result?.title).toBe("Delivery time expired");
    expect(result?.severity).toBe("transient");
    expect(result?.suggestedAction?.toLowerCase()).toMatch(/resend|retry/);
  });

  it("prefers the clean status field over a conflicting diagnosticCode", () => {
    const result = translateDiagnosticCode({
      status: "5.1.1",
      diagnosticCode: "smtp; 550 5.2.2 mailbox full",
    });
    expect(result?.title).toBe("Bad destination mailbox address");
    expect(result?.code).toBe("5.1.1");
  });
});

describe("translateDiagnosticCode — provider rules beat generic RFC", () => {
  it("recognizes Gmail unauthenticated blocks with an SPF/DKIM action", () => {
    const result = translateDiagnosticCode({
      status: "5.7.26",
      diagnosticCode: "smtp; 550 5.7.26 sender is unauthenticated",
    });
    expect(result?.provider).toBe("Gmail");
    expect(result?.suggestedAction?.toLowerCase()).toMatch(/spf|dkim/);
  });

  it("recognizes a Yahoo [TSS04] volume deferral as transient", () => {
    const result = translateDiagnosticCode({
      diagnosticCode:
        "smtp; 421 4.7.0 [TSS04] Messages temporarily deferred due to unexpected volume",
    });
    expect(result?.provider).toBe("Yahoo");
    expect(result?.severity).toBe("transient");
  });

  it("recognizes a Microsoft banned-IP block with a delisting action", () => {
    const result = translateDiagnosticCode({
      diagnosticCode:
        "smtp; 550 5.7.606 Access denied, banned sending IP [1.2.3.4]",
    });
    expect(result?.provider).toMatch(/microsoft|outlook/i);
    expect(result?.suggestedAction?.toLowerCase()).toContain("delist");
  });
});

describe("translateDiagnosticCode — fallbacks", () => {
  it("falls back to permanent class copy for a basic code with no enhanced code", () => {
    const result = translateDiagnosticCode({
      diagnosticCode: "smtp; 550 user unknown",
    });
    expect(result?.title).toBe("Permanent failure");
    expect(result?.severity).toBe("permanent");
    expect(result?.code).toBe("550");
  });

  it("falls back to the subject row for an unknown enhanced detail", () => {
    const result = translateDiagnosticCode({ status: "5.1.99" });
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Other address status");
    expect(result?.code).toBe("5.1.99");
    expect(result?.severity).toBe("permanent");
  });

  it("returns null when there is no recognizable code", () => {
    expect(
      translateDiagnosticCode({ diagnosticCode: "delivery failed permanently" })
    ).toBeNull();
    expect(translateDiagnosticCode({})).toBeNull();
  });

  it("does not misread IP octets in free text as an enhanced code", () => {
    const result = translateDiagnosticCode({
      diagnosticCode:
        "Client host [2.16.34.10] refused to talk to me: 550 5.7.1 blocked",
    });
    expect(result?.title).toBe("Delivery not authorized, message refused");
    expect(result?.severity).toBe("permanent");
    expect(result?.code).toBe("5.7.1");
  });

  it("does not produce an enhanced-code match for a version banner with no reply code", () => {
    const result = translateDiagnosticCode({
      diagnosticCode: "Postfix 2.11.3 ready",
    });
    expect(result).toBeNull();
  });
});

describe("describeEventDiagnostics — bounce", () => {
  it("builds a headline, fields, and one translated diagnostic per recipient", () => {
    const result = describeEventDiagnostics("bounce", {
      bounceType: "Permanent",
      bounceSubType: "General",
      bouncedRecipients: [
        {
          emailAddress: "a@example.com",
          status: "5.1.1",
          diagnosticCode: "smtp; 550 5.1.1 user unknown",
        },
        {
          emailAddress: "b@example.com",
          status: "5.2.2",
          diagnosticCode: "smtp; 552 5.2.2 mailbox full",
        },
      ],
    });
    expect(result).not.toBeNull();
    expect(result?.severity).toBe("permanent");
    expect(result?.headline.toLowerCase()).toContain("hard bounce");
    expect(result?.fields).toContainEqual({
      label: "Bounce type",
      value: "Permanent",
    });
    expect(result?.recipients).toHaveLength(2);
    expect(result?.recipients?.[0].emailAddress).toBe("a@example.com");
    expect(result?.recipients?.[0].translation?.title).toBe(
      "Bad destination mailbox address"
    );
    expect(result?.recipients?.[0].rawDiagnosticCode).toBe(
      "smtp; 550 5.1.1 user unknown"
    );
    expect(result?.recipients?.[1].emailAddress).toBe("b@example.com");
    // recipient[1] carries a DIFFERENT code and must get its OWN translation —
    // catches an implementation that computes recipient[0] and reuses it.
    expect(result?.recipients?.[1].translation?.title).toBe("Mailbox full");
  });
});

describe("describeEventDiagnostics — suppressed", () => {
  it("names the suppression and does not crash without bounceType", () => {
    const result = describeEventDiagnostics("suppressed", {
      reason: "BOUNCE",
      suppressedRecipients: [{ emailAddress: "c@example.com" }],
    });
    expect(result).not.toBeNull();
    expect(result?.headline.toLowerCase()).toContain("suppress");
    expect(result?.fields).toContainEqual({ label: "Reason", value: "BOUNCE" });
    expect(result?.recipients?.[0].emailAddress).toBe("c@example.com");
  });
});

describe("describeEventDiagnostics — complaint", () => {
  it("maps a known abuse feedback type", () => {
    const result = describeEventDiagnostics("complaint", {
      complaintFeedbackType: "abuse",
      complainedRecipients: [{ emailAddress: "d@example.com" }],
    });
    expect(result).not.toBeNull();
    expect(result?.severity).toBe("permanent");
    expect(result?.headline.toLowerCase()).toContain("spam");
    expect(result?.fields).toContainEqual({
      label: "Feedback type",
      value: "abuse",
    });
  });

  it("falls back to generic complaint copy when the feedback type is empty", () => {
    const result = describeEventDiagnostics("complaint", {
      complaintFeedbackType: "",
      complainedRecipients: [{ emailAddress: "e@example.com" }],
    });
    expect(result).not.toBeNull();
    // Exact generic copy — and the abuse-specific marker must be ABSENT (the abuse
    // headline also contains the word "complaint", so a substring check is too weak).
    expect(result?.headline).toBe("Spam complaint");
    expect(result?.headline).not.toContain("marked as spam");
  });
});

describe("describeEventDiagnostics — delivery and delay", () => {
  it("renders a successful delivery with SMTP and MTA fields", () => {
    const result = describeEventDiagnostics("delivery", {
      smtpResponse: "250 2.0.0 OK",
      remoteMtaIp: "127.0.2.0",
      processingTimeMillis: 546,
      recipients: ["f@example.com"],
    });
    expect(result?.severity).toBe("success");
    expect(result?.fields).toContainEqual({
      label: "Remote MTA",
      value: "127.0.2.0",
    });
    expect(result?.fields.some((f) => f.label === "Processing time")).toBe(
      true
    );
    expect(
      translateDiagnosticCode({ diagnosticCode: "250 2.0.0 OK" })?.severity
    ).toBe("success");
  });

  it("maps a delivery delay and dispatches both type spellings", () => {
    const metadata = {
      delayType: "MailboxFull",
      expirationTime: "2026-07-08T00:00:00.000Z",
      delayedRecipients: [{ emailAddress: "g@example.com" }],
    };
    const a = describeEventDiagnostics("deliverydelay", metadata);
    const b = describeEventDiagnostics("delivery_delay", metadata);
    expect(a?.severity).toBe("transient");
    expect(a?.headline.toLowerCase()).toContain("mailbox");
    expect(a?.fields.some((f) => f.label === "Expires")).toBe(true);
    expect(b?.headline).toBe(a?.headline);
  });
});

describe("describeEventDiagnostics — graceful degradation", () => {
  it("returns null for undefined metadata", () => {
    expect(describeEventDiagnostics("bounce", undefined)).toBeNull();
  });

  it("returns null for an unknown event type", () => {
    expect(describeEventDiagnostics("open", { userAgent: "x" })).toBeNull();
  });

  it("does not crash when bouncedRecipients is not an array", () => {
    const result = describeEventDiagnostics("bounce", {
      bounceType: "Permanent",
      bounceSubType: "General",
      bouncedRecipients: "not-an-array",
    });
    expect(result).not.toBeNull();
    expect(result?.recipients).toHaveLength(0);
  });

  it("skips a numeric diagnosticCode without throwing", () => {
    const result = describeEventDiagnostics("bounce", {
      bounceType: "Permanent",
      bounceSubType: "General",
      bouncedRecipients: [
        { emailAddress: "h@example.com", diagnosticCode: 550 },
      ],
    });
    expect(result?.recipients).toHaveLength(1);
    expect(result?.recipients?.[0].translation).toBeNull();
    expect(result?.recipients?.[0].rawDiagnosticCode).toBeUndefined();
  });

  it("returns null from translateDiagnosticCode for non-string inputs", () => {
    expect(
      translateDiagnosticCode({
        status: 5 as unknown as string,
        diagnosticCode: 550 as unknown as string,
      })
    ).toBeNull();
  });
});

describe("describeEventDiagnostics — reject and rendering failure", () => {
  it("formats a reject reason and accepts both type spellings", () => {
    const meta = { reason: "Message content rejected by SES" };
    const a = describeEventDiagnostics("reject", meta);
    const b = describeEventDiagnostics("rejected", meta);
    expect(a?.severity).toBe("permanent");
    expect(a?.fields).toContainEqual({
      label: "Reason",
      value: "Message content rejected by SES",
    });
    expect(b?.headline).toBe(a?.headline);
  });

  it("formats a rendering failure with error message and template fields", () => {
    const result = describeEventDiagnostics("rendering_failure", {
      errorMessage: "missing variable: firstName",
      templateName: "welcome",
    });
    expect(result?.severity).toBe("permanent");
    expect(result?.fields).toContainEqual({
      label: "Template",
      value: "welcome",
    });
    expect(result?.fields).toContainEqual({
      label: "Error",
      value: "missing variable: firstName",
    });
  });
});

describe("describeBounceSubtype", () => {
  it("returns the mapped headline, severity and action for a known pair", () => {
    const result = describeBounceSubtype({
      bounceType: "Permanent",
      bounceSubType: "General",
    });
    expect(result.title).toBe("Hard bounce — general failure");
    expect(result.severity).toBe("permanent");
    expect(result.suggestedAction).toContain("Remove the address");
  });

  it("falls back to the bounce-type headline for an unmapped pair", () => {
    expect(
      describeBounceSubtype({
        bounceType: "Permanent",
        bounceSubType: "Unlisted",
      })
    ).toMatchObject({ title: "Hard bounce", severity: "permanent" });
    expect(
      describeBounceSubtype({
        bounceType: "Transient",
        bounceSubType: "Unlisted",
      })
    ).toMatchObject({ title: "Soft bounce", severity: "transient" });
    expect(describeBounceSubtype({})).toMatchObject({
      title: "Bounce",
      severity: "unknown",
    });
  });
});

describe("describeComplaintFeedbackType", () => {
  it("returns the generic copy for null, undefined and unknown types", () => {
    for (const value of [
      null,
      undefined,
      "",
      "made-up-type",
      "constructor",
      "__proto__",
      "toString",
    ]) {
      expect(describeComplaintFeedbackType(value).title).toBe("Spam complaint");
    }
  });

  it("returns the registered copy for a known type", () => {
    expect(describeComplaintFeedbackType("abuse")).toMatchObject({
      title: "Spam complaint — marked as spam",
      severity: "permanent",
    });
  });

  it("treats a prototype-named feedback type as generic in describeEventDiagnostics", () => {
    expect(
      describeEventDiagnostics("complaint", {
        complaintFeedbackType: "constructor",
      })?.headline
    ).toBe("Spam complaint");
  });
});

describe("reason key is unique per translation", () => {
  it("no two different provider translations share a reason key", () => {
    const translations: CodeTranslation[] = PROVIDER_PATTERNS.map((p) => ({
      title: p.title,
      explanation: p.explanation,
      suggestedAction: p.action,
      code: p.code,
      provider: p.provider,
      severity: p.severity,
    }));
    expect(translations.length).toBeGreaterThan(0);
    expectOneCopyPerKey(translations);
  });

  it("no two different RFC enhanced-code translations share a reason key", () => {
    const translations: CodeTranslation[] = [];
    for (const cls of ["2", "4", "5"]) {
      for (let subject = 0; subject <= 9; subject++) {
        for (let detail = 0; detail <= 99; detail++) {
          const t = translateDiagnosticCode({
            status: `${cls}.${subject}.${detail}`,
          });
          if (t) {
            translations.push(t);
          }
        }
      }
    }
    expect(translations.length).toBeGreaterThan(0);
    expectOneCopyPerKey(translations);
  });

  it("basic SMTP codes and provider translations share one consistent key space", () => {
    const translations: CodeTranslation[] = [];
    for (const code of [
      "421",
      "450",
      "451",
      "452",
      "550",
      "551",
      "552",
      "553",
      "554",
    ]) {
      const t = translateDiagnosticCode({ diagnosticCode: code });
      if (t) {
        translations.push(t);
      }
    }
    expect(translations.length).toBe(9);
    expectOneCopyPerKey(translations);
  });
});
