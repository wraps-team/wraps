import {
  ACMClient,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";
import {
  CloudFrontClient,
  CreateDistributionWithTagsCommand,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  ListDistributionsCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeCertificate,
  disableDistribution,
  ensureCertificate,
  ensureDistribution,
  provisionTrackingHttps,
} from "../tracking-https.js";

vi.mock("../../dns/index.js", () => ({
  getDNSCredentials: vi.fn().mockResolvedValue({
    valid: true,
    credentials: { provider: "vercel", token: "tok" },
  }),
}));

vi.mock("../../dns/vercel.js", () => ({
  VercelDNSClient: vi.fn(function MockVercelDNSClient(this: {
    createRecords: () => Promise<never>;
  }) {
    this.createRecords = vi
      .fn()
      .mockRejectedValue(new Error("connection reset"));
  }),
}));

const acmMock = mockClient(ACMClient);
const cloudfrontMock = mockClient(CloudFrontClient);

beforeEach(() => {
  acmMock.reset();
  cloudfrontMock.reset();
});

describe("ensureCertificate", () => {
  it("finds an existing cert and does not request a new one", async () => {
    acmMock.on(ListCertificatesCommand).resolves({
      CertificateSummaryList: [
        { DomainName: "track.a.com", CertificateArn: "arn:aws:acm:existing" },
      ],
    });
    acmMock.on(DescribeCertificateCommand).resolves({
      Certificate: { Status: "ISSUED" },
    });

    const state = await ensureCertificate("track.a.com");

    expect(state).toMatchObject({
      arn: "arn:aws:acm:existing",
      status: "ISSUED",
    });
    expect(acmMock.commandCalls(RequestCertificateCommand).length).toBe(0);
  });

  it("requests a new cert with DNS validation and a ManagedBy tag when none exists", async () => {
    acmMock
      .on(ListCertificatesCommand)
      .resolves({ CertificateSummaryList: [] });
    acmMock.on(RequestCertificateCommand).resolves({
      CertificateArn: "arn:aws:acm:new",
    });
    acmMock.on(DescribeCertificateCommand).resolves({
      Certificate: {
        Status: "PENDING_VALIDATION",
        DomainValidationOptions: [
          {
            ResourceRecord: {
              Name: "_abc.track.a.com.",
              Type: "CNAME",
              Value: "_xyz.acm-validations.aws.",
            },
          },
        ],
      },
    });

    const state = await ensureCertificate("track.a.com");

    const requestCalls = acmMock.commandCalls(RequestCertificateCommand);
    expect(requestCalls.length).toBe(1);
    expect(requestCalls[0].args[0].input).toMatchObject({
      DomainName: "track.a.com",
      ValidationMethod: "DNS",
      Tags: [{ Key: "ManagedBy", Value: "wraps-cli" }],
    });
    expect(state.arn).toBe("arn:aws:acm:new");
    expect(state.validationRecord).toEqual({
      name: "_abc.track.a.com.",
      type: "CNAME",
      value: "_xyz.acm-validations.aws.",
    });
  });

  it("polls DescribeCertificate until the validation record appears", async () => {
    vi.useFakeTimers();
    try {
      acmMock
        .on(ListCertificatesCommand)
        .resolves({ CertificateSummaryList: [] });
      acmMock.on(RequestCertificateCommand).resolves({
        CertificateArn: "arn:aws:acm:slow",
      });
      acmMock
        .on(DescribeCertificateCommand)
        .resolvesOnce({ Certificate: { Status: "PENDING_VALIDATION" } })
        .resolvesOnce({ Certificate: { Status: "PENDING_VALIDATION" } })
        .resolves({
          Certificate: {
            Status: "PENDING_VALIDATION",
            DomainValidationOptions: [
              {
                ResourceRecord: {
                  Name: "_abc.track.a.com.",
                  Type: "CNAME",
                  Value: "_xyz.acm-validations.aws.",
                },
              },
            ],
          },
        });

      const promise = ensureCertificate("track.a.com");
      // Two poll iterations (3s each) before the record appears on the third describe.
      await vi.advanceTimersByTimeAsync(3000);
      await vi.advanceTimersByTimeAsync(3000);
      const state = await promise;

      expect(state.validationRecord).toBeDefined();
      expect(acmMock.commandCalls(DescribeCertificateCommand).length).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pages past the first 100 certificates before deciding to request one", async () => {
    // ACM returns 100 per page. Missing an existing cert is not merely slow:
    // every new certificate carries a different validation CNAME, so the
    // record the user already added never validates and HTTPS never leaves
    // "pending" — while unused certs pile up against the account quota.
    acmMock
      .on(ListCertificatesCommand)
      .resolvesOnce({
        CertificateSummaryList: [
          { DomainName: "other.com", CertificateArn: "arn:aws:acm:other" },
        ],
        NextToken: "page2",
      })
      .resolvesOnce({
        CertificateSummaryList: [
          { DomainName: "track.a.com", CertificateArn: "arn:aws:acm:page2" },
        ],
      });
    acmMock.on(DescribeCertificateCommand).resolves({
      Certificate: { Status: "ISSUED" },
    });

    const result = await ensureCertificate("track.a.com");

    expect(result.arn).toBe("arn:aws:acm:page2");
    expect(acmMock.commandCalls(RequestCertificateCommand).length).toBe(0);
    expect(
      acmMock.commandCalls(ListCertificatesCommand)[1].args[0].input.NextToken
    ).toBe("page2");
  });

  it("stops paging as soon as it finds the certificate", async () => {
    acmMock.on(ListCertificatesCommand).resolves({
      CertificateSummaryList: [
        { DomainName: "track.a.com", CertificateArn: "arn:aws:acm:page1" },
      ],
      NextToken: "page2",
    });
    acmMock.on(DescribeCertificateCommand).resolves({
      Certificate: { Status: "ISSUED" },
    });

    await ensureCertificate("track.a.com");

    expect(acmMock.commandCalls(ListCertificatesCommand).length).toBe(1);
  });
});

describe("describeCertificate", () => {
  it("re-reads status and validation record for a given ARN", async () => {
    acmMock.on(DescribeCertificateCommand).resolves({
      Certificate: { Status: "ISSUED" },
    });

    const state = await describeCertificate("arn:aws:acm:x");

    expect(state).toEqual({
      arn: "arn:aws:acm:x",
      status: "ISSUED",
      validationRecord: undefined,
    });
  });
});

describe("ensureDistribution", () => {
  it("returns the existing distribution when one matches the alias", async () => {
    cloudfrontMock.on(ListDistributionsCommand).resolves({
      DistributionList: {
        Items: [
          { Id: "EXIST123", Aliases: { Quantity: 1, Items: ["track.a.com"] } },
        ],
      },
    });
    cloudfrontMock.on(GetDistributionCommand).resolves({
      Distribution: { Id: "EXIST123", DomainName: "dexist.cloudfront.net" },
    });

    const result = await ensureDistribution({
      trackingDomain: "track.a.com",
      sesRegion: "us-east-1",
      certificateArn: "arn:aws:acm:x",
    });

    expect(result).toEqual({
      id: "EXIST123",
      domainName: "dexist.cloudfront.net",
      created: false,
    });
    expect(
      cloudfrontMock.commandCalls(CreateDistributionWithTagsCommand).length
    ).toBe(0);
  });

  it("creates a distribution with the alias, HTTPS-only origin, and Host header forwarding", async () => {
    cloudfrontMock.on(ListDistributionsCommand).resolves({
      DistributionList: { Items: [] },
    });
    cloudfrontMock.on(CreateDistributionWithTagsCommand).resolves({
      Distribution: { Id: "NEW123", DomainName: "dnew.cloudfront.net" },
    });

    const result = await ensureDistribution({
      trackingDomain: "track.b.com",
      sesRegion: "eu-west-1",
      certificateArn: "arn:aws:acm:y",
    });

    expect(result).toEqual({
      id: "NEW123",
      domainName: "dnew.cloudfront.net",
      created: true,
    });

    const calls = cloudfrontMock.commandCalls(
      CreateDistributionWithTagsCommand
    );
    expect(calls.length).toBe(1);
    const config =
      calls[0].args[0].input.DistributionConfigWithTags?.DistributionConfig;
    expect(config?.Aliases).toEqual({ Quantity: 1, Items: ["track.b.com"] });
    expect(config?.Origins?.Items?.[0]).toMatchObject({
      Id: "ses-tracking",
      DomainName: "r.eu-west-1.awstrack.me",
      CustomOriginConfig: expect.objectContaining({
        OriginProtocolPolicy: "http-only",
      }),
    });
    expect(config?.DefaultCacheBehavior?.ViewerProtocolPolicy).toBe(
      "redirect-to-https"
    );
    expect(config?.ViewerCertificate).toMatchObject({
      ACMCertificateArn: "arn:aws:acm:y",
      SSLSupportMethod: "sni-only",
    });
    // Critical: CloudFront must forward the Host header to awstrack.me or
    // SES cannot map the request back to the custom tracking domain.
    expect(
      config?.DefaultCacheBehavior?.ForwardedValues?.Headers?.Items
    ).toContain("*");
  });

  it("re-enables a distribution this CLI had disabled before reusing it", async () => {
    // disableDistribution leaves the alias attached, so the alias lookup still
    // matches a distribution that is switched off. Handing it back as-is would
    // put HttpsPolicy REQUIRE in front of a dead origin — SES rewrites every
    // link in outbound mail through the tracking domain, so recipients would
    // get CloudFront errors on every click, not merely lose tracking.
    cloudfrontMock.on(ListDistributionsCommand).resolves({
      DistributionList: {
        Items: [
          { Id: "OFF123", Aliases: { Quantity: 1, Items: ["track.c.com"] } },
        ],
      },
    });
    cloudfrontMock.on(GetDistributionCommand).resolves({
      Distribution: {
        Id: "OFF123",
        DomainName: "doff.cloudfront.net",
        DistributionConfig: { Enabled: false } as never,
      },
    });
    cloudfrontMock.on(GetDistributionConfigCommand).resolves({
      DistributionConfig: { Enabled: false, CallerReference: "x" } as never,
      ETag: "EOFFTAG",
    });
    cloudfrontMock.on(UpdateDistributionCommand).resolves({});

    const result = await ensureDistribution({
      trackingDomain: "track.c.com",
      sesRegion: "us-east-1",
      certificateArn: "arn:aws:acm:z",
    });

    expect(result).toEqual({
      id: "OFF123",
      domainName: "doff.cloudfront.net",
      created: false,
    });
    const updates = cloudfrontMock.commandCalls(UpdateDistributionCommand);
    expect(updates.length).toBe(1);
    expect(updates[0].args[0].input).toMatchObject({
      Id: "OFF123",
      IfMatch: "EOFFTAG",
      DistributionConfig: expect.objectContaining({ Enabled: true }),
    });
  });

  it("leaves an already-enabled distribution alone", async () => {
    cloudfrontMock.on(ListDistributionsCommand).resolves({
      DistributionList: {
        Items: [
          { Id: "ON123", Aliases: { Quantity: 1, Items: ["track.d.com"] } },
        ],
      },
    });
    cloudfrontMock.on(GetDistributionCommand).resolves({
      Distribution: {
        Id: "ON123",
        DomainName: "don.cloudfront.net",
        DistributionConfig: { Enabled: true } as never,
      },
    });

    await ensureDistribution({
      trackingDomain: "track.d.com",
      sesRegion: "us-east-1",
      certificateArn: "arn:aws:acm:z",
    });

    expect(cloudfrontMock.commandCalls(UpdateDistributionCommand).length).toBe(
      0
    );
  });

  it("pages past the first 100 distributions when matching the alias", async () => {
    // A miss here creates a second distribution for an alias CloudFront will
    // refuse (CNAMEAlreadyExists), breaking HTTPS tracking outright.
    cloudfrontMock
      .on(ListDistributionsCommand)
      .resolvesOnce({
        DistributionList: {
          Items: [
            { Id: "OTHER", Aliases: { Quantity: 1, Items: ["nope.com"] } },
          ],
          IsTruncated: true,
          NextMarker: "marker2",
        },
      })
      .resolvesOnce({
        DistributionList: {
          Items: [
            { Id: "PAGE2", Aliases: { Quantity: 1, Items: ["track.e.com"] } },
          ],
        },
      });
    cloudfrontMock.on(GetDistributionCommand).resolves({
      Distribution: {
        Id: "PAGE2",
        DomainName: "dpage2.cloudfront.net",
        DistributionConfig: { Enabled: true } as never,
      },
    });

    const result = await ensureDistribution({
      trackingDomain: "track.e.com",
      sesRegion: "us-east-1",
      certificateArn: "arn:aws:acm:z",
    });

    expect(result.id).toBe("PAGE2");
    expect(
      cloudfrontMock.commandCalls(CreateDistributionWithTagsCommand).length
    ).toBe(0);
  });
});

describe("disableDistribution", () => {
  it("sends UpdateDistributionCommand with Enabled:false and the current ETag", async () => {
    cloudfrontMock.on(GetDistributionConfigCommand).resolves({
      DistributionConfig: { Enabled: true, CallerReference: "x" } as never,
      ETag: "E123ETAG",
    });
    cloudfrontMock.on(UpdateDistributionCommand).resolves({});

    await disableDistribution("DIST123");

    const calls = cloudfrontMock.commandCalls(UpdateDistributionCommand);
    expect(calls.length).toBe(1);
    expect(calls[0].args[0].input).toMatchObject({
      Id: "DIST123",
      IfMatch: "E123ETAG",
      DistributionConfig: expect.objectContaining({ Enabled: false }),
    });
  });
});

describe("provisionTrackingHttps", () => {
  const fakeProgress = {
    execute: async (_msg: string, fn: () => Promise<unknown>) => fn(),
  } as never;

  it("stays pending with the validation record shown even when the DNS provider push fails", async () => {
    acmMock
      .on(ListCertificatesCommand)
      .resolves({ CertificateSummaryList: [] });
    acmMock.on(RequestCertificateCommand).resolves({
      CertificateArn: "arn:aws:acm:pending",
    });
    acmMock.on(DescribeCertificateCommand).resolves({
      Certificate: {
        Status: "PENDING_VALIDATION",
        DomainValidationOptions: [
          {
            ResourceRecord: {
              Name: "_abc.track.a.com.",
              Type: "CNAME",
              Value: "_xyz.acm-validations.aws.",
            },
          },
        ],
      },
    });

    const result = await provisionTrackingHttps({
      domain: "a.com",
      trackingDomain: "track.a.com",
      configSetName: "wraps-email-a-com",
      sesRegion: "us-east-1",
      sesv2: {} as never,
      metadataDnsProvider: "vercel",
      progress: fakeProgress,
    });

    expect(result.trackingHttps.status).toBe("pending");
    expect(result.dnsRecordsToShow).toEqual([
      {
        name: "_abc.track.a.com.",
        type: "CNAME",
        value: "_xyz.acm-validations.aws.",
      },
    ]);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
