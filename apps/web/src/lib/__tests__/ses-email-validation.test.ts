/**
 * SES Email Address Insights validation (plan 373 Phase C).
 *
 * Uses a stub SESv2Client (`{ send }`) rather than aws-sdk-client-mock, since
 * the function under test takes an already-constructed client and never
 * imports the AWS SDK itself beyond the command class.
 */

import type { SESv2Client } from "@aws-sdk/client-sesv2";
import { describe, expect, it } from "vitest";
import {
  SesValidationAccessDeniedError,
  validateEmailAddressesWithSes,
} from "../ses-email-validation";

function stubClient(handler: (email: string) => unknown): SESv2Client {
  return {
    send: async (command: { input: { EmailAddress: string } }) => {
      const result = handler(command.input.EmailAddress);
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
  } as unknown as SESv2Client;
}

function accessDeniedError(): Error {
  const error = new Error("User is not authorized to perform this action");
  error.name = "AccessDeniedException";
  return error;
}

function throttlingError(): Error {
  const error = new Error("Rate exceeded");
  error.name = "ThrottlingException";
  return error;
}

describe("validateEmailAddressesWithSes", () => {
  it("returns HIGH/MEDIUM/LOW verdicts read from MailboxValidation.IsValid.ConfidenceVerdict", async () => {
    const client = stubClient((email) => ({
      MailboxValidation: {
        IsValid: {
          ConfidenceVerdict:
            email === "high@example.com"
              ? "HIGH"
              : email === "medium@example.com"
                ? "MEDIUM"
                : "LOW",
        },
      },
    }));

    const result = await validateEmailAddressesWithSes(client, [
      "high@example.com",
      "medium@example.com",
      "low@example.com",
    ]);

    expect(result.verdicts).toEqual({
      "high@example.com": "HIGH",
      "medium@example.com": "MEDIUM",
      "low@example.com": "LOW",
    });
    expect(result.validatedCount).toBe(3);
    expect(result.stoppedEarly).toBe(false);
  });

  it("deduplicates the input so a repeated address is checked once", async () => {
    let calls = 0;
    const client = stubClient(() => {
      calls++;
      return { MailboxValidation: { IsValid: { ConfidenceVerdict: "HIGH" } } };
    });

    const result = await validateEmailAddressesWithSes(client, [
      "same@example.com",
      "same@example.com",
      "same@example.com",
    ]);

    expect(calls).toBe(1);
    expect(result.validatedCount).toBe(1);
  });

  it("marks an address UNKNOWN when the response has no ConfidenceVerdict", async () => {
    const client = stubClient(() => ({ MailboxValidation: {} }));

    const result = await validateEmailAddressesWithSes(client, [
      "no-verdict@example.com",
    ]);

    expect(result.verdicts["no-verdict@example.com"]).toBe("UNKNOWN");
  });

  it("marks an address UNKNOWN (not fatal) on an unrecognized per-address error", async () => {
    const client = stubClient((email) =>
      email === "bad@example.com"
        ? new Error("some transient SES error")
        : { MailboxValidation: { IsValid: { ConfidenceVerdict: "HIGH" } } }
    );

    const result = await validateEmailAddressesWithSes(client, [
      "bad@example.com",
      "good@example.com",
    ]);

    expect(result.verdicts["bad@example.com"]).toBe("UNKNOWN");
    expect(result.verdicts["good@example.com"]).toBe("HIGH");
    expect(result.validatedCount).toBe(2);
    expect(result.stoppedEarly).toBe(false);
  });

  it("stops cleanly on the first throttling error and reports how many were validated", async () => {
    const emails = Array.from({ length: 20 }, (_, i) => `addr${i}@example.com`);
    let served = 0;
    const client = stubClient(() => {
      served++;
      // Let a handful through before throttling.
      if (served > 3) {
        return throttlingError();
      }
      return { MailboxValidation: { IsValid: { ConfidenceVerdict: "HIGH" } } };
    });

    const result = await validateEmailAddressesWithSes(client, emails);

    expect(result.stoppedEarly).toBe(true);
    // Fewer addresses were validated than were given — the run stopped early.
    expect(result.validatedCount).toBeLessThan(emails.length);
    expect(result.validatedCount).toBeGreaterThan(0);
  });

  it("throws SesValidationAccessDeniedError on an access-denied response, rather than marking addresses UNKNOWN", async () => {
    const client = stubClient(() => accessDeniedError());

    await expect(
      validateEmailAddressesWithSes(client, ["one@example.com"])
    ).rejects.toBeInstanceOf(SesValidationAccessDeniedError);
  });

  it("classifies an AccessDenied error arriving as name:'Error' (message-carried code) the same way", async () => {
    const client = stubClient(() => {
      const err = new Error("AccessDenied: not authorized");
      // AWS SDK v3 sometimes returns the real code only in the message.
      return err;
    });

    await expect(
      validateEmailAddressesWithSes(client, ["one@example.com"])
    ).rejects.toBeInstanceOf(SesValidationAccessDeniedError);
  });

  it("never runs more than 5 calls concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const client = stubClient(() => {
      throw new Error("unused");
    });
    // Override send directly so we can track concurrency with real async gaps.
    (client as unknown as { send: (c: unknown) => Promise<unknown> }).send =
      async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return {
          MailboxValidation: { IsValid: { ConfidenceVerdict: "HIGH" } },
        };
      };

    const emails = Array.from({ length: 25 }, (_, i) => `c${i}@example.com`);
    await validateEmailAddressesWithSes(client, emails);

    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});
