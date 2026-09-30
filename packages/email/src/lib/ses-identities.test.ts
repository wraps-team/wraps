import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWrapsIdentity,
  scanWrapsIdentities,
  toWrapsIdentity,
} from "./ses-identities";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({})),
}));

vi.mock("@aws-sdk/client-sesv2", () => {
  function command(name: string) {
    return function cmd(this: unknown, input: unknown) {
      return { name, input };
    };
  }
  return {
    SESv2Client: vi.fn(function SESv2ClientMock() {
      return { send: mockSend };
    }),
    ListEmailIdentitiesCommand: vi.fn(command("List")),
    GetEmailIdentityCommand: vi.fn(command("Get")),
  };
});

const credentials = {
  accessKeyId: "k",
  secretAccessKey: "s",
  sessionToken: "t",
};

const entry = (name: string, enabled = true) => ({
  IdentityName: name,
  IdentityType: "DOMAIN" as const,
  SendingEnabled: enabled,
});

const wrapsDetails = {
  VerifiedForSendingStatus: true,
  ConfigurationSetName: "wraps-email-x",
};

function awsError(name: string): Error {
  const e = new Error(name);
  e.name = name;
  return e;
}

beforeEach(() => {
  mockSend.mockReset();
});

describe("toWrapsIdentity", () => {
  it("returns the identity for sending-enabled + verified + wraps set", () => {
    expect(toWrapsIdentity(entry("a.com"), wrapsDetails)).toEqual({
      identity: "a.com",
      type: "DOMAIN",
      configSetName: "wraps-email-x",
    });
  });

  it("returns null when sending is disabled", () => {
    expect(toWrapsIdentity(entry("a.com", false), wrapsDetails)).toBeNull();
  });

  it("returns null for a non-wraps config set", () => {
    expect(
      toWrapsIdentity(entry("a.com"), {
        VerifiedForSendingStatus: true,
        ConfigurationSetName: "other-set",
      })
    ).toBeNull();
  });

  it("returns null with no config set", () => {
    expect(
      toWrapsIdentity(entry("a.com"), { VerifiedForSendingStatus: true })
    ).toBeNull();
  });
});

describe("scanWrapsIdentities", () => {
  it("skips an identity whose GetEmailIdentity throws", async () => {
    mockSend.mockImplementation(async (cmd: unknown) => {
      const c = cmd as { name: string; input: { EmailIdentity?: string } };
      if (c.name === "List") {
        return { EmailIdentities: [entry("bad.com"), entry("good.com")] };
      }
      if (c.input.EmailIdentity === "bad.com") {
        throw awsError("AccessDenied");
      }
      return wrapsDetails;
    });
    expect(await scanWrapsIdentities(credentials, "us-east-1")).toEqual([
      { identity: "good.com", type: "DOMAIN", configSetName: "wraps-email-x" },
    ]);
  });

  it("returns [] for an empty list", async () => {
    mockSend.mockResolvedValue({ EmailIdentities: [] });
    expect(await scanWrapsIdentities(credentials, "us-east-1")).toEqual([]);
  });

  it("rejects when ListEmailIdentities fails", async () => {
    mockSend.mockRejectedValue(awsError("AccessDeniedException"));
    await expect(scanWrapsIdentities(credentials, "us-east-1")).rejects.toThrow(
      "AccessDeniedException"
    );
  });
});

describe("getWrapsIdentity", () => {
  it("returns null on NotFoundException and rethrows anything else", async () => {
    mockSend.mockRejectedValueOnce(awsError("NotFoundException"));
    expect(
      await getWrapsIdentity(credentials, "us-east-1", "a.com")
    ).toBeNull();

    mockSend.mockRejectedValueOnce(awsError("TooManyRequestsException"));
    await expect(
      getWrapsIdentity(credentials, "us-east-1", "a.com")
    ).rejects.toThrow("TooManyRequestsException");
  });
});
