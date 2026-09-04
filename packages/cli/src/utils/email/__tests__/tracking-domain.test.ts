import {
  DeleteConfigurationSetTrackingOptionsCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import {
  PutConfigurationSetTrackingOptionsCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTrackingDomain,
  defaultTrackingDomain,
  isTrackingDomainNotReady,
  putTrackingDomain,
  validateTrackingDomain,
} from "../tracking-domain.js";

const sesv2Mock = mockClient(SESv2Client);
const sesMock = mockClient(SESClient);

beforeEach(() => {
  sesv2Mock.reset();
  sesMock.reset();
});

describe("defaultTrackingDomain", () => {
  it('returns "track.a.com" for "a.com"', () => {
    expect(defaultTrackingDomain("a.com")).toBe("track.a.com");
  });
});

describe("validateTrackingDomain", () => {
  it("accepts track.a.com for sending domain a.com", () => {
    expect(validateTrackingDomain("track.a.com", "a.com")).toBeUndefined();
  });

  it("rejects track.b.com for sending domain a.com", () => {
    expect(validateTrackingDomain("track.b.com", "a.com")).toBe(
      "Must be a subdomain of a.com"
    );
  });

  it("rejects a value that isn't a hostname", () => {
    expect(validateTrackingDomain("not a host", "a.com")).toBe(
      "Enter a hostname like track.example.com"
    );
  });

  it("is case-insensitive", () => {
    expect(validateTrackingDomain("TRACK.A.COM", "A.COM")).toBeUndefined();
  });
});

describe("isTrackingDomainNotReady", () => {
  it.each([
    "Domain example.com is not verified",
    "The custom redirect domain must be a verified identity",
    "Identity verification pending",
  ])("is true for the unverified-identity message %j", (message) => {
    const err = Object.assign(new Error(message), {
      name: "BadRequestException",
    });
    expect(isTrackingDomainNotReady(err)).toBe(true);
  });

  it("is false for other error names", () => {
    const err = Object.assign(new Error("boom"), { name: "NotFoundException" });
    expect(isTrackingDomainNotReady(err)).toBe(false);
  });

  it("is false for a BadRequestException that is not about verification", () => {
    // The reason the name alone is not enough: callers treat "not ready" as
    // "will apply once the domain verifies", and a missing configuration set
    // never resolves that way.
    const err = Object.assign(
      new Error("Configuration set wraps-email-typo does not exist"),
      { name: "BadRequestException" }
    );
    expect(isTrackingDomainNotReady(err)).toBe(false);
  });

  it("is false for non-error values", () => {
    expect(isTrackingDomainNotReady(undefined)).toBe(false);
  });
});

describe("putTrackingDomain", () => {
  it("sends PutConfigurationSetTrackingOptionsCommand with both fields", async () => {
    sesv2Mock.on(PutConfigurationSetTrackingOptionsCommand).resolves({});
    const client = new SESv2Client({ region: "us-east-1" });

    await putTrackingDomain(client, "wraps-email-a-com", "track.a.com");

    const calls = sesv2Mock.commandCalls(
      PutConfigurationSetTrackingOptionsCommand
    );
    expect(calls.length).toBe(1);
    expect(calls[0].args[0].input).toEqual({
      ConfigurationSetName: "wraps-email-a-com",
      CustomRedirectDomain: "track.a.com",
    });
  });
});

describe("clearTrackingDomain", () => {
  it("sends the v1 DeleteConfigurationSetTrackingOptionsCommand", async () => {
    sesMock.on(DeleteConfigurationSetTrackingOptionsCommand).resolves({});

    await clearTrackingDomain("us-east-1", "wraps-email-a-com");

    const calls = sesMock.commandCalls(
      DeleteConfigurationSetTrackingOptionsCommand
    );
    expect(calls.length).toBe(1);
    expect(calls[0].args[0].input).toEqual({
      ConfigurationSetName: "wraps-email-a-com",
    });
  });
});
