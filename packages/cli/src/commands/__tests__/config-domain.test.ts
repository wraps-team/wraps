import {
  CreateArchiveCommand,
  GetArchiveCommand,
  ListArchivesCommand,
  MailManagerClient,
} from "@aws-sdk/client-mailmanager";
import {
  DeleteConfigurationSetTrackingOptionsCommand,
  SESClient,
} from "@aws-sdk/client-ses";
import {
  GetAccountCommand,
  GetConfigurationSetCommand,
  GetConfigurationSetEventDestinationsCommand,
  PutConfigurationSetArchivingOptionsCommand,
  PutConfigurationSetDeliveryOptionsCommand,
  PutConfigurationSetReputationOptionsCommand,
  PutConfigurationSetSendingOptionsCommand,
  PutConfigurationSetSuppressionOptionsCommand,
  PutConfigurationSetTrackingOptionsCommand,
  PutConfigurationSetVdmOptionsCommand,
  SESv2Client,
  UpdateConfigurationSetEventDestinationCommand,
} from "@aws-sdk/client-sesv2";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainToConfigSetName } from "../../utils/email/config-set-slug";
import { configDomain } from "../email/domains";

const sesClientMock = mockClient(SESv2Client);
const sesV1ClientMock = mockClient(SESClient);
const mailManagerMock = mockClient(MailManagerClient);

const mockExit = vi
  .spyOn(process, "exit")
  .mockImplementation((() => {}) as never);

vi.mock("@clack/prompts");

vi.mock("../../utils/shared/aws", () => ({
  getAWSRegion: vi.fn().mockResolvedValue("us-east-1"),
  validateAWSCredentials: vi.fn().mockResolvedValue({
    accountId: "123456789012",
    arn: "arn:aws:iam::123456789012:user/test",
    userId: "AIDATEST",
  }),
}));

vi.mock("../../utils/shared/metadata", () => ({
  findConnectionsWithService: vi.fn().mockResolvedValue([
    {
      accountId: "123456789012",
      region: "us-east-1",
      services: { email: { config: { domain: "primary.com" } } },
    },
  ]),
  loadConnectionMetadata: vi.fn().mockResolvedValue({
    version: "1.0.0",
    accountId: "123456789012",
    region: "us-east-1",
    provider: "vercel",
    timestamp: new Date().toISOString(),
    services: {
      email: {
        config: {
          domain: "primary.com",
          additionalDomains: [
            {
              domain: "test.com",
              configSetName: domainToConfigSetName("test.com"),
              addedAt: new Date().toISOString(),
            },
          ],
        },
        deployedAt: new Date().toISOString(),
      },
    },
  }),
  saveConnectionMetadata: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../telemetry/client", () => ({
  getTelemetryClient: vi
    .fn()
    .mockReturnValue({ track: vi.fn(), shutdown: vi.fn() }),
}));

vi.mock("../../telemetry/events", () => ({
  trackCommand: vi.fn(),
}));

vi.mock("../../utils/email/tracking-https", () => ({
  provisionTrackingHttps: vi.fn(),
  disableDistribution: vi.fn().mockResolvedValue(undefined),
  describeTrackingHttpsError: vi.fn(
    (error: unknown) => (error as Error)?.message ?? "Unknown AWS error"
  ),
}));

vi.mock("../../utils/dns/index", () => ({
  getDNSCredentials: vi.fn().mockResolvedValue({ valid: false }),
  createDNSRecordsForProvider: vi
    .fn()
    .mockResolvedValue({ success: true, recordsCreated: 1 }),
  getDNSProviderDisplayName: vi.fn().mockReturnValue("Vercel"),
}));

const additionalConfigSetName = domainToConfigSetName("test.com");
const primaryConfigSetName = domainToConfigSetName("primary.com");
const testArchiveArn =
  "arn:aws:ses:us-east-1:123456789012:mailmanager-archive/arch-abc";

function makeMetadata(overrides?: {
  primaryOnly?: boolean;
  suppressedReasons?: ("BOUNCE" | "COMPLAINT")[];
  trackingDomain?: string;
  trackingHttps?: {
    certificateArn: string;
    status: "pending" | "active";
    distributionId?: string;
    distributionDomain?: string;
  };
  dnsProvider?: "vercel" | "cloudflare" | "route53" | "manual";
}) {
  const additionalDomains = overrides?.primaryOnly
    ? []
    : [
        {
          domain: "test.com",
          configSetName: additionalConfigSetName,
          addedAt: new Date().toISOString(),
          trackingDomain: overrides?.trackingDomain,
          trackingHttps: overrides?.trackingHttps,
        },
      ];
  return {
    version: "1.0.0",
    accountId: "123456789012",
    region: "us-east-1",
    provider: "vercel",
    timestamp: new Date().toISOString(),
    services: {
      email: {
        config: {
          domain: "primary.com",
          additionalDomains,
        },
        dnsProvider: overrides?.dnsProvider,
        deployedAt: new Date().toISOString(),
      },
    },
  };
}

describe("configDomain — extended config set options", () => {
  let mockSpinner: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    message: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    sesClientMock.reset();
    sesV1ClientMock.reset();
    mailManagerMock.reset();
    vi.clearAllMocks();
    mockExit.mockClear();

    mockSpinner = { start: vi.fn(), stop: vi.fn(), message: vi.fn() };

    const clack = await import("@clack/prompts");
    vi.mocked(clack.spinner).mockReturnValue(mockSpinner as never);
    vi.mocked(clack.intro).mockImplementation(() => {});
    vi.mocked(clack.outro).mockImplementation(() => {});
    vi.mocked(clack.note).mockImplementation(() => {});
    vi.mocked(clack.log).info = vi.fn();
    vi.mocked(clack.log).warn = vi.fn();
    vi.mocked(clack.log).error = vi.fn();
    vi.mocked(clack.log).success = vi.fn();
    vi.mocked(clack.cancel).mockImplementation(() => {});
    vi.mocked(clack.isCancel).mockReturnValue(false);

    const metadata = await import("../../utils/shared/metadata");
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValue(
      makeMetadata() as never
    );
  });

  it("Unit 2 (tracer): interactive menu → Done immediately → no Put* commands called", async () => {
    sesClientMock.on(GetConfigurationSetCommand).resolves({});

    const clack = await import("@clack/prompts");
    vi.mocked(clack.select).mockResolvedValueOnce("done" as never);

    await configDomain({ domain: "test.com" });

    expect(
      sesClientMock.commandCalls(PutConfigurationSetDeliveryOptionsCommand)
        .length
    ).toBe(0);
    expect(
      sesClientMock.commandCalls(PutConfigurationSetReputationOptionsCommand)
        .length
    ).toBe(0);
    expect(
      sesClientMock.commandCalls(PutConfigurationSetSendingOptionsCommand)
        .length
    ).toBe(0);
    expect(
      sesClientMock.commandCalls(PutConfigurationSetSuppressionOptionsCommand)
        .length
    ).toBe(0);
    expect(
      sesClientMock.commandCalls(PutConfigurationSetArchivingOptionsCommand)
        .length
    ).toBe(0);
    expect(
      sesClientMock.commandCalls(PutConfigurationSetVdmOptionsCommand).length
    ).toBe(0);

    const clackModule = await import("@clack/prompts");
    expect(clackModule.outro).toHaveBeenCalled();
  });

  it("Unit 3: interactive delivery group → REQUIRE TLS → PutDeliveryOptions + metadata saved", async () => {
    sesClientMock.on(GetConfigurationSetCommand).resolves({
      DeliveryOptions: { TlsPolicy: "OPTIONAL" },
    });
    sesClientMock.on(PutConfigurationSetDeliveryOptionsCommand).resolves({});

    const clack = await import("@clack/prompts");
    vi.mocked(clack.select)
      .mockResolvedValueOnce("delivery" as never)
      .mockResolvedValueOnce("done" as never);
    vi.mocked(clack.confirm).mockResolvedValueOnce(true as never); // require TLS

    const metadata = await import("../../utils/shared/metadata");

    await configDomain({ domain: "test.com" });

    const deliveryCalls = sesClientMock.commandCalls(
      PutConfigurationSetDeliveryOptionsCommand
    );
    expect(deliveryCalls.length).toBe(1);
    expect(deliveryCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: additionalConfigSetName,
      TlsPolicy: "REQUIRE",
    });

    expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        services: expect.objectContaining({
          email: expect.objectContaining({
            config: expect.objectContaining({
              additionalDomains: expect.arrayContaining([
                expect.objectContaining({
                  domain: "test.com",
                  tlsRequired: true,
                }),
              ]),
            }),
          }),
        }),
      })
    );
  });

  it("Unit 4: interactive reputation group → enabled + metadata saved", async () => {
    sesClientMock.on(GetConfigurationSetCommand).resolves({
      ReputationOptions: { ReputationMetricsEnabled: false },
    });
    sesClientMock.on(PutConfigurationSetReputationOptionsCommand).resolves({});

    const clack = await import("@clack/prompts");
    vi.mocked(clack.select)
      .mockResolvedValueOnce("reputation" as never)
      .mockResolvedValueOnce("done" as never);
    vi.mocked(clack.confirm).mockResolvedValueOnce(true as never); // enable

    const metadata = await import("../../utils/shared/metadata");

    await configDomain({ domain: "test.com" });

    const repCalls = sesClientMock.commandCalls(
      PutConfigurationSetReputationOptionsCommand
    );
    expect(repCalls.length).toBe(1);
    expect(repCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: additionalConfigSetName,
      ReputationMetricsEnabled: true,
    });

    expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        services: expect.objectContaining({
          email: expect.objectContaining({
            config: expect.objectContaining({
              additionalDomains: expect.arrayContaining([
                expect.objectContaining({
                  domain: "test.com",
                  reputationMetrics: true,
                }),
              ]),
            }),
          }),
        }),
      })
    );
  });

  it("Unit 5: interactive suppression → bounce=false, complaint=true → SuppressedReasons=[COMPLAINT]", async () => {
    sesClientMock.on(GetConfigurationSetCommand).resolves({
      SuppressionOptions: { SuppressedReasons: ["BOUNCE", "COMPLAINT"] },
    });
    sesClientMock.on(PutConfigurationSetSuppressionOptionsCommand).resolves({});

    const clack = await import("@clack/prompts");
    vi.mocked(clack.select)
      .mockResolvedValueOnce("suppression" as never)
      .mockResolvedValueOnce("done" as never);
    vi.mocked(clack.confirm)
      .mockResolvedValueOnce(false as never) // bounce: off
      .mockResolvedValueOnce(true as never); // complaint: on

    await configDomain({ domain: "test.com" });

    const supCalls = sesClientMock.commandCalls(
      PutConfigurationSetSuppressionOptionsCommand
    );
    expect(supCalls.length).toBe(1);
    expect(supCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: additionalConfigSetName,
      SuppressedReasons: ["COMPLAINT"],
    });
    expect(supCalls[0].args[0].input.SuppressedReasons).not.toContain("BOUNCE");
  });

  it("Unit 6: interactive archive — existing archive found → PutArchivingOptions with existing ARN", async () => {
    sesClientMock.on(GetConfigurationSetCommand).resolves({
      ArchivingOptions: { ArchiveArn: undefined },
    });
    sesClientMock.on(PutConfigurationSetArchivingOptionsCommand).resolves({});

    mailManagerMock.on(ListArchivesCommand).resolves({
      Archives: [
        {
          ArchiveState: "ACTIVE",
          ArchiveName: "wraps-email-archive",
          ArchiveId: "arch-existing",
        },
      ],
    });
    mailManagerMock
      .on(GetArchiveCommand)
      .resolves({ ArchiveArn: testArchiveArn });

    const clack = await import("@clack/prompts");
    vi.mocked(clack.select)
      .mockResolvedValueOnce("archive" as never)
      .mockResolvedValueOnce("done" as never);
    vi.mocked(clack.confirm).mockResolvedValueOnce(true as never); // enable

    await configDomain({ domain: "test.com" });

    const archiveCalls = sesClientMock.commandCalls(
      PutConfigurationSetArchivingOptionsCommand
    );
    expect(archiveCalls.length).toBe(1);
    expect(archiveCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: additionalConfigSetName,
      ArchiveArn: testArchiveArn,
    });

    // Verify we used the existing archive (ListArchives called, CreateArchive NOT called)
    expect(mailManagerMock.commandCalls(ListArchivesCommand).length).toBe(1);
    expect(mailManagerMock.commandCalls(CreateArchiveCommand).length).toBe(0);
  });

  it("Unit 7: interactive archive — no existing → CreateArchive → PutArchivingOptions", async () => {
    sesClientMock.on(GetConfigurationSetCommand).resolves({});
    sesClientMock.on(PutConfigurationSetArchivingOptionsCommand).resolves({});

    mailManagerMock.on(ListArchivesCommand).resolves({ Archives: [] });
    mailManagerMock
      .on(CreateArchiveCommand)
      .resolves({ ArchiveId: "new-arch-id" });
    mailManagerMock
      .on(GetArchiveCommand)
      .resolves({ ArchiveArn: testArchiveArn });

    const clack = await import("@clack/prompts");
    vi.mocked(clack.select)
      .mockResolvedValueOnce("archive" as never)
      .mockResolvedValueOnce("done" as never);
    vi.mocked(clack.confirm).mockResolvedValueOnce(true as never); // enable

    await configDomain({ domain: "test.com" });

    expect(mailManagerMock.commandCalls(CreateArchiveCommand).length).toBe(1);
    expect(
      mailManagerMock.commandCalls(CreateArchiveCommand)[0].args[0].input
    ).toMatchObject({ ArchiveName: "wraps-email-archive" });

    const archiveCalls = sesClientMock.commandCalls(
      PutConfigurationSetArchivingOptionsCommand
    );
    expect(archiveCalls.length).toBe(1);
    expect(archiveCalls[0].args[0].input.ArchiveArn).toBe(testArchiveArn);
  });

  it("Unit 8a: VDM option absent from menu when account VdmEnabled is DISABLED", async () => {
    sesClientMock.on(GetConfigurationSetCommand).resolves({});
    sesClientMock.on(GetAccountCommand).resolves({
      VdmAttributes: { VdmEnabled: "DISABLED" },
    } as never);

    const clack = await import("@clack/prompts");
    vi.mocked(clack.select).mockResolvedValueOnce("done" as never);

    await configDomain({ domain: "test.com" });

    const selectCall = vi.mocked(clack.select).mock.calls[0][0];
    const optionValues = (selectCall.options as Array<{ value: string }>).map(
      (o) => o.value
    );
    expect(optionValues).not.toContain("vdm");
  });

  it("Unit 8b: VDM option present and callable when account VdmEnabled is ENABLED", async () => {
    sesClientMock.on(GetConfigurationSetCommand).resolves({});
    sesClientMock.on(GetAccountCommand).resolves({
      VdmAttributes: { VdmEnabled: "ENABLED" },
    } as never);
    sesClientMock.on(PutConfigurationSetVdmOptionsCommand).resolves({});

    const clack = await import("@clack/prompts");
    vi.mocked(clack.select)
      .mockResolvedValueOnce("vdm" as never)
      .mockResolvedValueOnce("done" as never);
    vi.mocked(clack.confirm)
      .mockResolvedValueOnce(true as never) // engagement: on
      .mockResolvedValueOnce(false as never); // inbox: off

    await configDomain({ domain: "test.com" });

    const vdmCalls = sesClientMock.commandCalls(
      PutConfigurationSetVdmOptionsCommand
    );
    expect(vdmCalls.length).toBe(1);
    expect(vdmCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: additionalConfigSetName,
      VdmOptions: {
        DashboardOptions: { EngagementMetrics: "ENABLED" },
        GuardianOptions: { OptimizedSharedDelivery: "DISABLED" },
      },
    });
  });

  it("Unit 9: interactive sending group → disable → PutSendingOptions false", async () => {
    sesClientMock.on(GetConfigurationSetCommand).resolves({
      SendingOptions: { SendingEnabled: true },
    });
    sesClientMock.on(PutConfigurationSetSendingOptionsCommand).resolves({});

    const clack = await import("@clack/prompts");
    vi.mocked(clack.select)
      .mockResolvedValueOnce("sending" as never)
      .mockResolvedValueOnce("done" as never);
    vi.mocked(clack.confirm).mockResolvedValueOnce(false as never); // disable

    await configDomain({ domain: "test.com" });

    const sendingCalls = sesClientMock.commandCalls(
      PutConfigurationSetSendingOptionsCommand
    );
    expect(sendingCalls.length).toBe(1);
    expect(sendingCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: additionalConfigSetName,
      SendingEnabled: false,
    });

    const metadata = await import("../../utils/shared/metadata");
    expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        services: expect.objectContaining({
          email: expect.objectContaining({
            config: expect.objectContaining({
              additionalDomains: expect.arrayContaining([
                expect.objectContaining({
                  domain: "test.com",
                  sendingEnabled: false,
                }),
              ]),
            }),
          }),
        }),
      })
    );
  });

  it("Unit 10: flag mode: tlsRequired:true → bypasses menu, PutDeliveryOptions REQUIRE", async () => {
    sesClientMock.on(PutConfigurationSetDeliveryOptionsCommand).resolves({});

    const clack = await import("@clack/prompts");

    await configDomain({ domain: "test.com", tlsRequired: true });

    const deliveryCalls = sesClientMock.commandCalls(
      PutConfigurationSetDeliveryOptionsCommand
    );
    expect(deliveryCalls.length).toBe(1);
    expect(deliveryCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: additionalConfigSetName,
      TlsPolicy: "REQUIRE",
    });

    // Flag mode does not show the interactive menu
    expect(vi.mocked(clack.select)).not.toHaveBeenCalled();
  });

  it("Unit 11: flag mode: tlsRequired:false → PutDeliveryOptions OPTIONAL, no menu shown", async () => {
    sesClientMock.on(PutConfigurationSetDeliveryOptionsCommand).resolves({});

    const clack = await import("@clack/prompts");

    await configDomain({ domain: "test.com", tlsRequired: false });

    const deliveryCalls = sesClientMock.commandCalls(
      PutConfigurationSetDeliveryOptionsCommand
    );
    expect(deliveryCalls.length).toBe(1);
    expect(deliveryCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: additionalConfigSetName,
      TlsPolicy: "OPTIONAL",
    });

    expect(vi.mocked(clack.select)).not.toHaveBeenCalled();
  });

  it("Unit 12: flag mode: primary domain → saves to emailConfig, not additionalDomains", async () => {
    const metadata = await import("../../utils/shared/metadata");
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
      makeMetadata({ primaryOnly: true }) as never
    );

    sesClientMock.on(PutConfigurationSetReputationOptionsCommand).resolves({});

    await configDomain({ domain: "primary.com", reputationMetrics: true });

    const repCalls = sesClientMock.commandCalls(
      PutConfigurationSetReputationOptionsCommand
    );
    expect(repCalls.length).toBe(1);
    expect(repCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: primaryConfigSetName,
      ReputationMetricsEnabled: true,
    });

    expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        services: expect.objectContaining({
          email: expect.objectContaining({
            config: expect.objectContaining({
              reputationMetrics: true,
            }),
          }),
        }),
      })
    );

    // Must NOT be in additionalDomains
    const saved = vi.mocked(metadata.saveConnectionMetadata).mock
      .calls[0][0] as {
      services: {
        email: { config: { additionalDomains?: Array<{ domain: string }> } };
      };
    };
    const savedAdditional =
      saved?.services?.email?.config?.additionalDomains ?? [];
    expect(savedAdditional.some((d) => d.domain === "primary.com")).toBe(false);
  });

  it("Unit 13: flag mode: primary domain + archive → PutArchivingOptions + clack.note shown", async () => {
    const metadata = await import("../../utils/shared/metadata");
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
      makeMetadata({ primaryOnly: true }) as never
    );

    sesClientMock.on(PutConfigurationSetArchivingOptionsCommand).resolves({});
    mailManagerMock.on(ListArchivesCommand).resolves({
      Archives: [
        {
          ArchiveState: "ACTIVE",
          ArchiveName: "wraps-email-archive",
          ArchiveId: "arch-existing",
        },
      ],
    });
    mailManagerMock
      .on(GetArchiveCommand)
      .resolves({ ArchiveArn: testArchiveArn });

    const clack = await import("@clack/prompts");

    await configDomain({ domain: "primary.com", archive: true });

    const archiveCalls = sesClientMock.commandCalls(
      PutConfigurationSetArchivingOptionsCommand
    );
    expect(archiveCalls.length).toBe(1);
    expect(archiveCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: primaryConfigSetName,
      ArchiveArn: testArchiveArn,
    });

    // Primary domain change: clack.note suggests wraps email upgrade
    expect(clack.note).toHaveBeenCalledWith(
      expect.stringContaining("wraps email upgrade"),
      expect.any(String)
    );

    // emailArchiving persisted so Pulumi sync picks it up on next deploy
    expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        services: expect.objectContaining({
          email: expect.objectContaining({
            config: expect.objectContaining({
              emailArchiving: expect.objectContaining({ enabled: true }),
            }),
          }),
        }),
      })
    );
  });

  it("Unit 14: flag mode: trackingDomain set → PutConfigurationSetTrackingOptions on the additional domain's set", async () => {
    sesClientMock.on(PutConfigurationSetTrackingOptionsCommand).resolves({});

    const metadata = await import("../../utils/shared/metadata");

    await configDomain({
      domain: "test.com",
      trackingDomain: "track.test.com",
    });

    const putCalls = sesClientMock.commandCalls(
      PutConfigurationSetTrackingOptionsCommand
    );
    expect(putCalls.length).toBe(1);
    expect(putCalls[0].args[0].input).toEqual({
      ConfigurationSetName: additionalConfigSetName,
      CustomRedirectDomain: "track.test.com",
    });
    expect(metadata.saveConnectionMetadata).toHaveBeenCalled();

    const clack = await import("@clack/prompts");
    expect(vi.mocked(clack.select)).not.toHaveBeenCalled();
  });

  it('Unit 15: flag mode: trackingDomain "none" → v1 DeleteConfigurationSetTrackingOptions, no Put', async () => {
    sesV1ClientMock
      .on(DeleteConfigurationSetTrackingOptionsCommand)
      .resolves({});

    await configDomain({ domain: "test.com", trackingDomain: "none" });

    const deleteCalls = sesV1ClientMock.commandCalls(
      DeleteConfigurationSetTrackingOptionsCommand
    );
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: additionalConfigSetName,
    });
    expect(
      sesClientMock.commandCalls(PutConfigurationSetTrackingOptionsCommand)
        .length
    ).toBe(0);
  });

  it("defers instead of failing when SES has not verified the identity yet", async () => {
    // Same degradation `domains add` performs. Without it, the documented
    // `domains config --tracking-domain` path threw a raw BadRequestException
    // while the identical operation through `domains add` deferred cleanly.
    const notVerified = Object.assign(
      new Error("Domain test.com is not verified"),
      { name: "BadRequestException" }
    );
    sesClientMock
      .on(PutConfigurationSetTrackingOptionsCommand)
      .rejects(notVerified);

    const metadata = await import("../../utils/shared/metadata");
    const clack = await import("@clack/prompts");

    await configDomain({
      domain: "test.com",
      trackingDomain: "track.test.com",
    });

    expect(mockExit).not.toHaveBeenCalled();
    expect(clack.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("wraps email domains verify")
    );
    // The domain is still recorded, so `domains verify` has something to apply.
    expect(metadata.saveConnectionMetadata).toHaveBeenCalled();
  });

  it("still fails loudly on a BadRequestException that is not about verification", async () => {
    // A missing configuration set never resolves into "applied once verified",
    // so swallowing it would hide the failure behind a deferral that never comes.
    const missingConfigSet = Object.assign(
      new Error("Configuration set wraps-email-typo does not exist"),
      { name: "BadRequestException" }
    );
    sesClientMock
      .on(PutConfigurationSetTrackingOptionsCommand)
      .rejects(missingConfigSet);

    await expect(
      configDomain({ domain: "test.com", trackingDomain: "track.test.com" })
    ).rejects.toThrow("does not exist");
  });

  it("Unit 16: flag mode: trackingDomain on the primary domain is refused", async () => {
    const metadata = await import("../../utils/shared/metadata");
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
      makeMetadata({ primaryOnly: true }) as never
    );

    const clack = await import("@clack/prompts");

    await configDomain({
      domain: "primary.com",
      trackingDomain: "track.primary.com",
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(clack.log.error).toHaveBeenCalledWith(
      expect.stringContaining("wraps email upgrade")
    );
    expect(
      sesClientMock.commandCalls(PutConfigurationSetTrackingOptionsCommand)
        .length
    ).toBe(0);
    expect(
      sesV1ClientMock.commandCalls(DeleteConfigurationSetTrackingOptionsCommand)
        .length
    ).toBe(0);
  });

  it("Unit 17: flag mode: trackingDomain outside the sending domain is refused", async () => {
    const clack = await import("@clack/prompts");

    await configDomain({
      domain: "test.com",
      trackingDomain: "track.elsewhere.com",
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(clack.log.error).toHaveBeenCalledWith(
      expect.stringContaining("subdomain of test.com")
    );
  });

  it("Unit 18: flag mode: trackingHttps:true with no tracking domain set is refused", async () => {
    const clack = await import("@clack/prompts");

    await configDomain({ domain: "test.com", trackingHttps: true });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(clack.log.error).toHaveBeenCalledWith(
      expect.stringContaining("no tracking domain")
    );
  });

  it("Unit 19: flag mode: pending → active transition re-creates the tracking CNAME with replaceExisting", async () => {
    const metadata = await import("../../utils/shared/metadata");
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
      makeMetadata({
        trackingDomain: "track.test.com",
        dnsProvider: "vercel",
      }) as never
    );

    const trackingHttps = await import("../../utils/email/tracking-https");
    vi.mocked(trackingHttps.provisionTrackingHttps).mockResolvedValueOnce({
      trackingHttps: {
        certificateArn: "arn:aws:acm:x",
        status: "active",
        distributionId: "DIST1",
        distributionDomain: "dabc.cloudfront.net",
      },
      cnameTarget: "dabc.cloudfront.net",
      dnsRecordsToShow: [],
    });

    const dns = await import("../../utils/dns/index");
    vi.mocked(dns.getDNSCredentials).mockResolvedValueOnce({
      valid: true,
      credentials: { provider: "vercel", token: "tok" },
    } as never);

    await configDomain({ domain: "test.com", trackingHttps: true });

    expect(trackingHttps.provisionTrackingHttps).toHaveBeenCalledWith(
      expect.objectContaining({
        trackingDomain: "track.test.com",
        configSetName: additionalConfigSetName,
      })
    );

    const createCalls = vi.mocked(dns.createDNSRecordsForProvider).mock.calls;
    expect(createCalls.length).toBe(1);
    expect(createCalls[0][1]).toMatchObject({
      customTrackingDomain: "track.test.com",
      trackingCnameTarget: "dabc.cloudfront.net",
    });
    expect(createCalls[0][2]).toEqual(new Set(["tracking"]));
    expect(createCalls[0][3]).toEqual({ replaceExisting: true });

    expect(metadata.saveConnectionMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        services: expect.objectContaining({
          email: expect.objectContaining({
            config: expect.objectContaining({
              additionalDomains: expect.arrayContaining([
                expect.objectContaining({
                  domain: "test.com",
                  trackingHttps: expect.objectContaining({ status: "active" }),
                }),
              ]),
            }),
          }),
        }),
      })
    );
  });

  it("Unit 20: flag mode: trackingHttps:false sets HttpsPolicy OPTIONAL and disables the distribution", async () => {
    const metadata = await import("../../utils/shared/metadata");
    vi.mocked(metadata.loadConnectionMetadata).mockResolvedValueOnce(
      makeMetadata({
        trackingDomain: "track.test.com",
        trackingHttps: {
          certificateArn: "arn:aws:acm:x",
          status: "active",
          distributionId: "DIST1",
          distributionDomain: "dabc.cloudfront.net",
        },
      }) as never
    );
    sesClientMock.on(PutConfigurationSetTrackingOptionsCommand).resolves({});

    const trackingHttps = await import("../../utils/email/tracking-https");

    await configDomain({ domain: "test.com", trackingHttps: false });

    const putCalls = sesClientMock.commandCalls(
      PutConfigurationSetTrackingOptionsCommand
    );
    expect(putCalls.length).toBe(1);
    expect(putCalls[0].args[0].input).toMatchObject({
      ConfigurationSetName: additionalConfigSetName,
      CustomRedirectDomain: "track.test.com",
      HttpsPolicy: "OPTIONAL",
    });
    expect(trackingHttps.disableDistribution).toHaveBeenCalledWith("DIST1");
  });
});
