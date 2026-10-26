import type * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type {
  CdnStackConfig,
  CdnStackOutputs,
  Provider,
} from "../types/index.js";
import {
  createCdnACMCertificate,
  createCdnBucket,
  createCdnDistribution,
} from "./resources/s3-cdn.js";
import { createServiceIAMRole } from "./shared/iam.js";
import type { ProgramOutputs } from "./shared/program-outputs.js";
import { createVercelOIDC } from "./vercel-oidc.js";

/**
 * IAM role configuration for storage
 */
type CdnIAMConfig = {
  provider: Provider;
  oidcProvider?: aws.iam.OpenIdConnectProvider;
  vercelTeamSlug?: string;
  vercelProjectName?: string;
  bucketArn: pulumi.Output<string>;
  distributionArn?: pulumi.Output<string>;
};

/**
 * Create IAM role for storage infrastructure
 */
async function createCdnIAMRole(config: CdnIAMConfig): Promise<aws.iam.Role> {
  // Build policy statements for S3 access (contains Output values, must be resolved)
  const resolvedStatements = pulumi
    .all([config.bucketArn, config.distributionArn])
    .apply(([bucketArn, distributionArn]) => {
      const statements: any[] = [
        {
          Sid: "StorageBucketAccess",
          Effect: "Allow",
          Action: [
            "s3:PutObject",
            "s3:GetObject",
            "s3:DeleteObject",
            "s3:ListBucket",
            "s3:GetBucketLocation",
            "s3:GetObjectTagging",
            "s3:PutObjectTagging",
          ],
          Resource: [bucketArn, `${bucketArn}/*`],
        },
      ];

      if (distributionArn) {
        statements.push({
          Sid: "CloudFrontInvalidation",
          Effect: "Allow",
          Action: [
            "cloudfront:CreateInvalidation",
            "cloudfront:GetInvalidation",
            "cloudfront:ListInvalidations",
          ],
          Resource: distributionArn,
        });
      }

      return statements;
    });

  return createServiceIAMRole({
    serviceName: "cdn",
    provider: config.provider,
    oidcProvider: config.oidcProvider,
    vercelTeamSlug: config.vercelTeamSlug,
    vercelProjectName: config.vercelProjectName,
    policyStatements: resolvedStatements,
    extraTags: { Service: "cdn" },
  });
}

/**
 * Deploy storage infrastructure stack using Pulumi
 */
export async function deployCdnStack(
  config: CdnStackConfig
): Promise<ProgramOutputs<CdnStackOutputs>> {
  // Use account ID from config (already validated by CLI)
  const accountId = config.accountId;

  let oidcProvider: aws.iam.OpenIdConnectProvider | undefined;

  // 1. Create OIDC provider if Vercel
  if (config.provider === "vercel" && config.vercel) {
    oidcProvider = await createVercelOIDC({
      teamSlug: config.vercel.teamSlug,
      accountId,
    });
  }

  // 2. Create S3 bucket
  const bucketResources = await createCdnBucket({
    accountId,
    region: config.region,
    cdnConfig: config.cdnConfig,
  });

  // 3. Create ACM certificate if custom domain is configured
  let acmResources;
  let hostedZone: { id: string } | null = null;

  if (config.cdnConfig.cdn.customDomain) {
    // Extract root domain from custom domain (e.g., cdn.example.com -> example.com)
    const domainParts = config.cdnConfig.cdn.customDomain.split(".");
    const rootDomain =
      domainParts.length > 2
        ? domainParts.slice(-2).join(".")
        : config.cdnConfig.cdn.customDomain;

    // Check for Route53 hosted zone (for automatic DNS validation)
    const { findHostedZone } = await import("../utils/route53.js");
    hostedZone = await findHostedZone(rootDomain, config.region);

    // Create ACM certificate (in us-east-1 for CloudFront)
    acmResources = await createCdnACMCertificate({
      domain: config.cdnConfig.cdn.customDomain,
      hostedZoneId: hostedZone?.id,
    });
  }

  // 4. Create CloudFront distribution (if CDN enabled)
  let cdnResources;
  if (config.cdnConfig.cdn.enabled) {
    // Determine which certificate ARN to use:
    // - certValidated: Use existing cert (manual validation completed via upgrade)
    // - Route53: Use certificateValidation.certificateArn (waits for validation)
    // - Manual DNS: Don't use cert yet - it's not validated
    // When there's no Route53 hosted zone, we create CloudFront WITHOUT custom domain
    // User must manually validate cert, then run `storage upgrade` to add custom domain
    const hasAutoValidation = acmResources?.certificateValidation;
    const useCertFromUpgrade = config.certValidated && config.existingCertArn;

    // Certificate ARN: prefer existing validated cert, then auto-validated cert
    const certificateArn = useCertFromUpgrade
      ? pulumi.output(config.existingCertArn!)
      : hasAutoValidation
        ? acmResources?.certificateValidation?.certificateArn
        : undefined;

    // Custom domain: use if cert is available (either from upgrade or auto-validation)
    const customDomainForCdn =
      useCertFromUpgrade || hasAutoValidation
        ? config.cdnConfig.cdn.customDomain
        : undefined;

    cdnResources = await createCdnDistribution({
      bucket: bucketResources.bucket,
      bucketRegion: config.region, // For Origin Shield
      customDomain: customDomainForCdn,
      certificateArn,
      priceClass: config.cdnConfig.cdn.priceClass,
      originShield: config.cdnConfig.cdn.originShield,
      geoRestriction: config.cdnConfig.cdn.geoRestriction,
      wafEnabled: config.cdnConfig.cdn.wafEnabled,
    });
  }

  // 5. Create IAM role with S3 and CloudFront permissions
  const role = await createCdnIAMRole({
    provider: config.provider,
    oidcProvider,
    vercelTeamSlug: config.vercel?.teamSlug,
    vercelProjectName: config.vercel?.projectName,
    bucketArn: bucketResources.bucketArn,
    distributionArn: cdnResources?.distribution.arn,
  });

  // Determine if custom domain is active or pending manual validation
  // Custom domain is active if: Route53 auto-validated OR manually validated via upgrade
  const hasAutoValidation = acmResources?.certificateValidation;
  const hasCertFromUpgrade = config.certValidated && config.existingCertArn;
  const customDomainActive =
    config.cdnConfig.cdn.customDomain &&
    (hasAutoValidation || hasCertFromUpgrade);
  const customDomainPending =
    config.cdnConfig.cdn.customDomain &&
    !hasAutoValidation &&
    !hasCertFromUpgrade;

  // Return outputs
  return {
    roleArn: role.arn,
    bucketName: bucketResources.bucketName,
    bucketArn: bucketResources.bucketArn,
    region: config.region,
    distributionId: cdnResources?.distributionId,
    distributionDomain: cdnResources?.domainName,
    // Report custom domain if it's actually configured on CloudFront (auto or manual validation)
    customDomain: customDomainActive
      ? config.cdnConfig.cdn.customDomain
      : undefined,
    // Report pending custom domain that needs manual cert validation
    customDomainPending: customDomainPending
      ? config.cdnConfig.cdn.customDomain
      : undefined,
    acmCertificateArn: acmResources?.certificate.arn,
    acmCertificateValidationRecords: acmResources?.validationRecords,
    versioning: config.cdnConfig.versioning ?? false,
    retention: config.cdnConfig.retention,
  };
}

/**
 * Run Pulumi program inline for storage
 */
export async function runCdnPulumiProgram(
  stackName: string,
  region: string,
  program: () => Promise<ProgramOutputs<CdnStackOutputs>>
): Promise<CdnStackOutputs> {
  const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
    {
      stackName,
      projectName: "wraps-cdn",
      program,
    },
    {
      workDir: `${process.env.HOME}/.wraps/pulumi`,
    }
  );

  // Set AWS region
  await stack.setConfig("aws:region", { value: region });

  // Run the deployment
  const upResult = await stack.up({
    onOutput: (msg) => process.stdout.write(msg),
  });

  // Get outputs
  const outputs = upResult.outputs;

  return {
    roleArn: outputs.roleArn?.value as string,
    bucketName: outputs.bucketName?.value as string,
    bucketArn: outputs.bucketArn?.value as string,
    region: outputs.region?.value as string,
    distributionId: outputs.distributionId?.value as string | undefined,
    distributionDomain: outputs.distributionDomain?.value as string | undefined,
    customDomain: outputs.customDomain?.value as string | undefined,
    customDomainPending: outputs.customDomainPending?.value as
      | string
      | undefined,
    acmCertificateArn: outputs.acmCertificateArn?.value as string | undefined,
    acmCertificateValidationRecords: outputs.acmCertificateValidationRecords
      ?.value as
      | Array<{ name: string; type: string; value: string }>
      | undefined,
    versioning: outputs.versioning?.value as boolean,
    retention: outputs.retention?.value as CdnStackOutputs["retention"],
  };
}

/**
 * Preview storage stack changes
 */
export async function previewCdnStack(
  stackName: string,
  region: string,
  program: () => Promise<ProgramOutputs<CdnStackOutputs>>
): Promise<pulumi.automation.PreviewResult> {
  const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
    {
      stackName,
      projectName: "wraps-cdn",
      program,
    },
    {
      workDir: `${process.env.HOME}/.wraps/pulumi`,
    }
  );

  // Set AWS region
  await stack.setConfig("aws:region", { value: region });

  // Run preview
  return stack.preview({
    onOutput: (msg) => process.stdout.write(msg),
  });
}

/**
 * Destroy storage stack
 */
export async function destroyCdnStack(
  stackName: string,
  region: string
): Promise<void> {
  const stack = await pulumi.automation.LocalWorkspace.selectStack(
    {
      stackName,
      projectName: "wraps-cdn",
      program: async () => ({}),
    },
    {
      workDir: `${process.env.HOME}/.wraps/pulumi`,
    }
  );

  // Set AWS region
  await stack.setConfig("aws:region", { value: region });

  // Destroy resources
  await stack.destroy({
    onOutput: (msg) => process.stdout.write(msg),
  });

  // Remove the stack
  await stack.workspace.removeStack(stackName);
}
