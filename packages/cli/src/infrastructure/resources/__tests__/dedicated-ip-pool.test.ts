import { GetDedicatedIpPoolCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, describe, expect, it } from "vitest";
import { getManagedPoolState } from "../dedicated-ip-pool.js";

const sesClientMock = mockClient(SESv2Client);

afterEach(() => {
  sesClientMock.reset();
});

describe("getManagedPoolState", () => {
  it('returns "managed" when the pool exists with ScalingMode MANAGED', async () => {
    sesClientMock.on(GetDedicatedIpPoolCommand).resolves({
      DedicatedIpPool: {
        PoolName: "wraps-email-managed",
        ScalingMode: "MANAGED",
      },
    });

    await expect(getManagedPoolState("us-east-1")).resolves.toBe("managed");
  });

  it('returns "standard" when the pool exists with ScalingMode STANDARD', async () => {
    sesClientMock.on(GetDedicatedIpPoolCommand).resolves({
      DedicatedIpPool: {
        PoolName: "wraps-email-managed",
        ScalingMode: "STANDARD",
      },
    });

    await expect(getManagedPoolState("us-east-1")).resolves.toBe("standard");
  });

  it('returns "absent" on a NotFoundException', async () => {
    const notFound = Object.assign(new Error("NotFoundException"), {
      name: "NotFoundException",
    });
    sesClientMock.on(GetDedicatedIpPoolCommand).rejects(notFound);

    await expect(getManagedPoolState("us-east-1")).resolves.toBe("absent");
  });

  it('returns "absent" on the SDK-v3 quirk (name: Error, message carries the real code)', async () => {
    const genericError = Object.assign(
      new Error("UnknownError: NotFoundException: pool not found"),
      { name: "Error" }
    );
    sesClientMock.on(GetDedicatedIpPoolCommand).rejects(genericError);

    await expect(getManagedPoolState("us-east-1")).resolves.toBe("absent");
  });

  it("rethrows on AccessDeniedException rather than guessing", async () => {
    const accessDenied = Object.assign(new Error("AccessDeniedException"), {
      name: "AccessDeniedException",
    });
    sesClientMock.on(GetDedicatedIpPoolCommand).rejects(accessDenied);

    await expect(getManagedPoolState("us-east-1")).rejects.toThrow(
      "AccessDeniedException"
    );
  });
});
