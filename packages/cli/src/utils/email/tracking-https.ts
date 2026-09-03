import {
  ACMClient,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  RequestCertificateCommand,
} from "@aws-sdk/client-acm";
import {
  CloudFrontClient,
  CreateDistributionWithTagsCommand,
  type DistributionConfig,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  ChangeResourceRecordSetsCommand,
  Route53Client,
} from "@aws-sdk/client-route-53";
import type { SESv2Client } from "@aws-sdk/client-sesv2";
import { findDistributionByAlias } from "../../infrastructure/resources/cloudfront.js";
import type { AdditionalDomain } from "../../types/index.js";
import { CloudflareDNSClient } from "../dns/cloudflare.js";
import { getDNSCredentials } from "../dns/index.js";
import { VercelDNSClient } from "../dns/vercel.js";
import type { DeploymentProgress } from "../shared/output.js";
import type { DNSProviderType } from "../shared/prompts.js";
import { putTrackingDomain } from "./tracking-domain.js";

// CloudFront requires the ACM certificate to be requested in us-east-1
// regardless of the SES region, and the CloudFront API itself is us-east-1-only.
const US_EAST_1 = "us-east-1";
const CERT_POLL_ATTEMPTS = 10;
const CERT_POLL_INTERVAL_MS = 3000;

export type CertificateState = {
  arn: string;
  status: "PENDING_VALIDATION" | "ISSUED" | "FAILED" | string;
  validationRecord?: { name: string; type: string; value: string };
};

type AcmCertificate = {
  Status?: string;
  DomainValidationOptions?: Array<{
    ResourceRecord?: { Name?: string; Value?: string; Type?: string };
  }>;
};

function toCertificateState(
  arn: string,
  cert: AcmCertificate | undefined
): CertificateState {
  const status = cert?.Status ?? "PENDING_VALIDATION";
  const option = cert?.DomainValidationOptions?.find(
    (o) => o.ResourceRecord?.Name && o.ResourceRecord?.Value
  );
  const validationRecord = option?.ResourceRecord
    ? {
        name: option.ResourceRecord.Name as string,
        type: option.ResourceRecord.Type ?? "CNAME",
        value: option.ResourceRecord.Value as string,
      }
    : undefined;
  return { arn, status, validationRecord };
}

/** Re-read a certificate's status + validation record. */
export async function describeCertificate(
  arn: string
): Promise<CertificateState> {
  const acm = new ACMClient({ region: US_EAST_1 });
  const response = await acm.send(
    new DescribeCertificateCommand({ CertificateArn: arn })
  );
  return toCertificateState(arn, response.Certificate);
}

/** Find an ACM cert for `domain` in us-east-1 (PENDING or ISSUED) or request one. */
export async function ensureCertificate(
  domain: string
): Promise<CertificateState> {
  const acm = new ACMClient({ region: US_EAST_1 });
  const listResponse = await acm.send(
    new ListCertificatesCommand({
      CertificateStatuses: ["PENDING_VALIDATION", "ISSUED"],
    })
  );
  const existing = listResponse.CertificateSummaryList?.find(
    (c) => c.DomainName === domain
  );
  if (existing?.CertificateArn) {
    return describeCertificate(existing.CertificateArn);
  }

  const requestResponse = await acm.send(
    new RequestCertificateCommand({
      DomainName: domain,
      ValidationMethod: "DNS",
      Tags: [{ Key: "ManagedBy", Value: "wraps-cli" }],
    })
  );
  const arn = requestResponse.CertificateArn;
  if (!arn) {
    throw new Error("ACM did not return a certificate ARN");
  }

  // RequestCertificate returns immediately; DomainValidationOptions[].ResourceRecord
  // can take a few seconds to populate — poll until it does.
  let state = await describeCertificate(arn);
  let attempt = 0;
  while (!state.validationRecord && attempt < CERT_POLL_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, CERT_POLL_INTERVAL_MS));
    state = await describeCertificate(arn);
    attempt++;
  }
  return state;
}

/**
 * Find a distribution whose alias is `trackingDomain`, or create one mirroring
 * the primary domain's Pulumi spec (`infrastructure/resources/cloudfront.ts`).
 */
export async function ensureDistribution(args: {
  trackingDomain: string;
  sesRegion: string;
  certificateArn: string;
}): Promise<{ id: string; domainName: string; created: boolean }> {
  const { trackingDomain, sesRegion, certificateArn } = args;
  const cloudfront = new CloudFrontClient({ region: US_EAST_1 });

  const existingId = await findDistributionByAlias(trackingDomain);
  if (existingId) {
    const existing = await cloudfront.send(
      new GetDistributionCommand({ Id: existingId })
    );
    const domainName = existing.Distribution?.DomainName;
    if (!domainName) {
      throw new Error(
        `CloudFront distribution ${existingId} has no DomainName`
      );
    }
    return { id: existingId, domainName, created: false };
  }

  const distributionConfig: DistributionConfig = {
    CallerReference: `wraps-email-tracking-${trackingDomain}-${Date.now()}`,
    Comment: "Wraps email tracking with HTTPS support",
    Enabled: true,
    Aliases: { Quantity: 1, Items: [trackingDomain] },
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: "ses-tracking",
          DomainName: `r.${sesRegion}.awstrack.me`,
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            // SES's tracking endpoint is HTTP-only.
            OriginProtocolPolicy: "http-only",
            OriginSslProtocols: { Quantity: 1, Items: ["TLSv1.2"] },
          },
        },
      ],
    },
    DefaultCacheBehavior: {
      TargetOriginId: "ses-tracking",
      ViewerProtocolPolicy: "redirect-to-https",
      AllowedMethods: {
        Quantity: 3,
        Items: ["GET", "HEAD", "OPTIONS"],
        CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
      },
      ForwardedValues: {
        QueryString: true,
        Cookies: { Forward: "all" },
        // Must include "*": CloudFront has to pass the viewer Host header
        // through to awstrack.me or SES cannot map the request back to the
        // custom tracking domain, and click/open tracking fails silently.
        Headers: { Quantity: 1, Items: ["*"] },
      },
      MinTTL: 0,
      DefaultTTL: 0,
      MaxTTL: 31_536_000,
      Compress: true,
    },
    PriceClass: "PriceClass_100",
    Restrictions: {
      GeoRestriction: { RestrictionType: "none", Quantity: 0 },
    },
    ViewerCertificate: {
      ACMCertificateArn: certificateArn,
      SSLSupportMethod: "sni-only",
      MinimumProtocolVersion: "TLSv1.2_2021",
    },
  };

  const result = await cloudfront.send(
    new CreateDistributionWithTagsCommand({
      DistributionConfigWithTags: {
        DistributionConfig: distributionConfig,
        Tags: { Items: [{ Key: "ManagedBy", Value: "wraps-cli" }] },
      },
    })
  );

  const id = result.Distribution?.Id;
  const domainName = result.Distribution?.DomainName;
  if (!(id && domainName)) {
    throw new Error("CloudFront did not return a distribution Id/DomainName");
  }
  return { id, domainName, created: true };
}

/** UpdateDistribution Enabled:false. Never deletes — see plan maintenance notes. */
export async function disableDistribution(id: string): Promise<void> {
  const cloudfront = new CloudFrontClient({ region: US_EAST_1 });
  const current = await cloudfront.send(
    new GetDistributionConfigCommand({ Id: id })
  );
  if (!current.DistributionConfig) {
    throw new Error(`CloudFront distribution ${id} has no configuration`);
  }
  await cloudfront.send(
    new UpdateDistributionCommand({
      Id: id,
      IfMatch: current.ETag,
      DistributionConfig: { ...current.DistributionConfig, Enabled: false },
    })
  );
}

/**
 * Best-effort push of a single DNS record (used for the ACM validation
 * CNAME) via the cached DNS provider. Mirrors the Vercel/Cloudflare pattern
 * in `upgrade.ts` (ACM validation for the primary domain) and Route53's
 * UPSERT pattern in `create-records.ts`. Never throws — callers already show
 * the record for manual creation regardless of whether this succeeds.
 */
async function pushValidationRecord(
  provider: DNSProviderType,
  sendingDomain: string,
  sesRegion: string,
  record: { name: string; type: string; value: string }
): Promise<boolean> {
  try {
    const domainParts = sendingDomain.split(".");
    const parentDomain =
      domainParts.length > 2 ? domainParts.slice(-2).join(".") : sendingDomain;

    const credResult = await getDNSCredentials(
      provider,
      parentDomain,
      sesRegion
    );
    if (!(credResult.valid && credResult.credentials)) {
      return false;
    }

    if (credResult.credentials.provider === "vercel") {
      const client = new VercelDNSClient(
        parentDomain,
        credResult.credentials.token,
        credResult.credentials.teamId
      );
      const result = await client.createRecords([record]);
      return result.success;
    }

    if (credResult.credentials.provider === "cloudflare") {
      const client = new CloudflareDNSClient(
        credResult.credentials.zoneId,
        credResult.credentials.token
      );
      const result = await client.createRecords([record]);
      return result.success;
    }

    if (credResult.credentials.provider === "route53") {
      const route53 = new Route53Client({ region: sesRegion });
      await route53.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: credResult.credentials.hostedZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: "UPSERT",
                ResourceRecordSet: {
                  Name: record.name,
                  Type: "CNAME",
                  TTL: 300,
                  ResourceRecords: [{ Value: record.value }],
                },
              },
            ],
          },
        })
      );
      return true;
    }

    return false;
    // baseline:allow-next-line no-swallowed-errors — best-effort DNS push;
    // the caller already shows the validation record for manual creation
    // regardless of whether this succeeds (see provisionTrackingHttps).
  } catch {
    return false;
  }
}

/** Human-readable text for the ACM/CloudFront errors this feature can hit. */
export function describeTrackingHttpsError(error: unknown): string {
  const name = (error as { name?: string } | undefined)?.name;
  switch (name) {
    case "LimitExceededException":
      return "ACM certificate limit reached in this AWS account. Request a quota increase or remove unused certificates in ACM (us-east-1), then try again.";
    case "CNAMEAlreadyExists":
      return "This tracking domain is already used by another CloudFront distribution in this AWS account.";
    case "InvalidViewerCertificate":
      return "The ACM certificate is not yet ISSUED. Wait for DNS validation to complete, then try again.";
    case "AccessDenied":
    case "AccessDeniedException":
      return "Missing IAM permissions for ACM/CloudFront. Grant acm:RequestCertificate, acm:DescribeCertificate, acm:ListCertificates, cloudfront:CreateDistributionWithTags, cloudfront:GetDistribution, cloudfront:GetDistributionConfig, cloudfront:UpdateDistribution.";
    default:
      return error instanceof Error ? error.message : "Unknown AWS error";
  }
}

/**
 * Drive the HTTPS setup as far as AWS allows right now and return the new
 * metadata block. Idempotent: safe to call again after the cert validates.
 */
export async function provisionTrackingHttps(args: {
  domain: string;
  trackingDomain: string;
  configSetName: string;
  sesRegion: string;
  sesv2: SESv2Client;
  metadataDnsProvider?: DNSProviderType;
  existing?: AdditionalDomain["trackingHttps"];
  progress: DeploymentProgress;
}): Promise<{
  trackingHttps: NonNullable<AdditionalDomain["trackingHttps"]>;
  cnameTarget: string;
  dnsRecordsToShow: Array<{ name: string; type: string; value: string }>;
}> {
  const {
    domain,
    trackingDomain,
    configSetName,
    sesRegion,
    sesv2,
    metadataDnsProvider,
    existing,
    progress,
  } = args;
  const awstrackTarget = `r.${sesRegion}.awstrack.me`;

  const cert = await progress.execute("Checking ACM certificate", async () =>
    existing?.certificateArn
      ? describeCertificate(existing.certificateArn)
      : ensureCertificate(trackingDomain)
  );

  if (cert.status !== "ISSUED") {
    const dnsRecordsToShow: Array<{
      name: string;
      type: string;
      value: string;
    }> = [];
    if (cert.validationRecord) {
      dnsRecordsToShow.push(cert.validationRecord);
      if (metadataDnsProvider && metadataDnsProvider !== "manual") {
        await progress.execute(
          "Creating ACM validation DNS record",
          async () => {
            await pushValidationRecord(
              metadataDnsProvider,
              domain,
              sesRegion,
              cert.validationRecord as {
                name: string;
                type: string;
                value: string;
              }
            );
          }
        );
      }
    }
    return {
      trackingHttps: {
        certificateArn: cert.arn,
        status: "pending",
        validationRecord: cert.validationRecord,
      },
      cnameTarget: awstrackTarget,
      dnsRecordsToShow,
    };
  }

  const distribution = await progress.execute(
    "Creating CloudFront distribution",
    async () =>
      ensureDistribution({
        trackingDomain,
        sesRegion,
        certificateArn: cert.arn,
      })
  );

  await progress.execute("Requiring HTTPS for tracking links", async () =>
    putTrackingDomain(sesv2, configSetName, trackingDomain, "REQUIRE")
  );

  return {
    trackingHttps: {
      certificateArn: cert.arn,
      status: "active",
      distributionId: distribution.id,
      distributionDomain: distribution.domainName,
    },
    cnameTarget: distribution.domainName,
    dnsRecordsToShow: [],
  };
}
