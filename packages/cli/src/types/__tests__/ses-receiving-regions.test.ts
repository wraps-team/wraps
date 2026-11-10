import { describe, expect, it } from "vitest";
import { errors } from "../../utils/shared/errors.js";
import { SES_RECEIVING_REGIONS } from "../email.js";

describe("SES_RECEIVING_REGIONS", () => {
  // The "Email Receiving endpoints" table in the AWS General Reference:
  // https://docs.aws.amazon.com/general/latest/gr/ses.html
  it("lists every region with an SES email receiving endpoint", () => {
    expect([...SES_RECEIVING_REGIONS].sort()).toEqual([
      "af-south-1",
      "ap-northeast-1",
      "ap-northeast-2",
      "ap-northeast-3",
      "ap-south-1",
      "ap-southeast-1",
      "ap-southeast-2",
      "ap-southeast-3",
      "ca-central-1",
      "eu-central-1",
      "eu-west-1",
      "us-east-1",
      "us-east-2",
      "us-west-1",
      "us-west-2",
    ]);
  });

  it("names every supported region when one is rejected", () => {
    const error = errors.inboundRegionNotSupported("eu-north-1");

    expect(error.code).toBe("INBOUND_REGION_NOT_SUPPORTED");
    for (const region of SES_RECEIVING_REGIONS) {
      expect(error.suggestion).toContain(region);
    }
  });
});
