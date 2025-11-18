import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/**
 * CloudFront resources configuration
 */
export type CloudFrontTrackingConfig = {
  customTrackingDomain: string;
  region: string; // SES region for the origin
  certificateArn: pulumi.Output<string>;
};

/**
 * Find existing CloudFront distribution by alias (CNAME)
 */
async function findDistributionByAlias(
  alias: string
): Promise<string | null> {
  try {
    const { CloudFrontClient, ListDistributionsCommand } = await import(
      "@aws-sdk/client-cloudfront"
    );
    const cloudfront = new CloudFrontClient({ region: "us-east-1" }); // CloudFront is global but API is in us-east-1

    const response = await cloudfront.send(new ListDistributionsCommand({}));

    // Find distribution with matching alias
    const distribution = response.DistributionList?.Items?.find((dist) =>
      dist.Aliases?.Items?.includes(alias)
    );

    return distribution?.Id || null;
  } catch (error) {
    console.error("Error finding CloudFront distribution:", error);
    return null;
  }
}

/**
 * CloudFront resources output
 */
export type CloudFrontResources = {
  distribution: aws.cloudfront.Distribution;
  domainName: pulumi.Output<string>;
  webAcl: aws.wafv2.WebAcl;
};

/**
 * Create WAF Web ACL with rate limiting for CloudFront
 *
 * This creates a WAFv2 Web ACL with rate limiting protection
 * to prevent abuse of tracking endpoints.
 */
async function createWAFWebACL(): Promise<aws.wafv2.WebAcl> {
  // WAF for CloudFront must be created in us-east-1
  const usEast1Provider = new aws.Provider("waf-us-east-1", {
    region: "us-east-1",
  });

  const webAcl = new aws.wafv2.WebAcl(
    "wraps-email-tracking-waf",
    {
      scope: "CLOUDFRONT", // WAF for CloudFront must use CLOUDFRONT scope
      description: "Rate limiting protection for Wraps email tracking",

      defaultAction: {
        allow: {}, // Allow by default
      },

      rules: [
        {
          name: "RateLimitRule",
          priority: 1,
          action: {
            block: {}, // Block requests exceeding rate limit
          },
          statement: {
            rateBasedStatement: {
              limit: 2000, // 2000 requests per 5 minutes per IP
              aggregateKeyType: "IP",
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudwatchMetricsEnabled: true,
            metricName: "RateLimitRule",
          },
        },
      ],

      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudwatchMetricsEnabled: true,
        metricName: "wraps-email-tracking-waf",
      },

      tags: {
        ManagedBy: "wraps-cli",
        Description: "WAF for Wraps email tracking with rate limiting",
      },
    },
    {
      provider: usEast1Provider,
    }
  );

  return webAcl;
}

/**
 * Create CloudFront distribution for HTTPS tracking domain
 *
 * This creates a CloudFront distribution that sits in front of AWS SES's tracking endpoint
 * (r.{region}.awstrack.me) and provides HTTPS support with a custom domain and SSL certificate.
 * Also creates a WAF Web ACL with rate limiting for security.
 */
export async function createCloudFrontTracking(
  config: CloudFrontTrackingConfig
): Promise<CloudFrontResources> {
  const sesTrackingOrigin = `r.${config.region}.awstrack.me`;

  // Create WAF Web ACL with rate limiting protection
  const webAcl = await createWAFWebACL();

  // Check if CloudFront distribution already exists with this alias
  const existingDistributionId = await findDistributionByAlias(
    config.customTrackingDomain
  );

  // CloudFront distribution configuration
  const distributionConfig = {
    enabled: true,
    comment: "Wraps email tracking with HTTPS support",
    aliases: [config.customTrackingDomain],

    // Attach WAF Web ACL for rate limiting protection
    webAclId: webAcl.arn,

    // Origin: SES tracking endpoint
    origins: [
      {
        domainName: sesTrackingOrigin,
        originId: "ses-tracking",
        customOriginConfig: {
          httpPort: 80,
          httpsPort: 443,
          originProtocolPolicy: "http-only", // SES tracking endpoint is HTTP
          originSslProtocols: ["TLSv1.2"],
        },
      },
    ],

    // Default cache behavior
    defaultCacheBehavior: {
      targetOriginId: "ses-tracking",
      viewerProtocolPolicy: "redirect-to-https", // Force HTTPS
      allowedMethods: ["GET", "HEAD", "OPTIONS"],
      cachedMethods: ["GET", "HEAD"],

      // Forward all query strings and headers (tracking links use query params)
      forwardedValues: {
        queryString: true,
        cookies: {
          forward: "all",
        },
        headers: ["*"], // Forward all headers to preserve tracking functionality
      },

      // Minimal caching for tracking redirects
      minTtl: 0,
      defaultTtl: 0,
      maxTtl: 31536000,

      compress: true,
    },

    // Price class (use only North America & Europe for cost optimization)
    priceClass: "PriceClass_100",

    // Restrictions (none)
    restrictions: {
      geoRestriction: {
        restrictionType: "none",
      },
    },

    // SSL certificate from ACM
    viewerCertificate: {
      acmCertificateArn: config.certificateArn,
      sslSupportMethod: "sni-only",
      minimumProtocolVersion: "TLSv1.2_2021",
    },

    tags: {
      ManagedBy: "wraps-cli",
      Description: "Wraps email tracking CloudFront distribution",
    },
  };

  const distribution = existingDistributionId
    ? new aws.cloudfront.Distribution(
        "wraps-email-tracking-cdn",
        distributionConfig,
        {
          import: existingDistributionId, // Import existing distribution
        }
      )
    : new aws.cloudfront.Distribution(
        "wraps-email-tracking-cdn",
        distributionConfig
      );

  return {
    distribution,
    domainName: distribution.domainName,
    webAcl,
  };
}
