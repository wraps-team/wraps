import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/**
 * ACM certificate configuration
 */
export type ACMCertificateConfig = {
  domain: string;
  hostedZoneId?: string; // Optional Route53 hosted zone for automatic DNS validation
};

/**
 * ACM certificate output
 */
export type ACMCertificateResources = {
  certificate: aws.acm.Certificate;
  certificateValidation?: aws.acm.CertificateValidation;
  validationRecords: pulumi.Output<
    Array<{
      name: string;
      type: string;
      value: string;
    }>
  >;
};

/**
 * Create ACM certificate for custom tracking domain
 *
 * IMPORTANT: CloudFront requires ACM certificates to be created in us-east-1 region.
 * This function creates the certificate in us-east-1 regardless of the SES region.
 *
 * If a Route53 hosted zone ID is provided, DNS validation records will be created
 * automatically and we'll wait for validation. Otherwise, validation records are
 * returned for manual creation.
 */
export async function createACMCertificate(
  config: ACMCertificateConfig
): Promise<ACMCertificateResources> {
  const usEast1Provider = new aws.Provider("acm-us-east-1", {
    region: "us-east-1",
  });

  // Create ACM certificate in us-east-1 (required for CloudFront)
  const certificate = new aws.acm.Certificate(
    "wraps-email-tracking-cert",
    {
      domainName: config.domain,
      validationMethod: "DNS",
      tags: {
        ManagedBy: "wraps-cli",
        Description: "SSL certificate for Wraps email tracking domain",
      },
    },
    {
      provider: usEast1Provider,
    }
  );

  // Extract validation records
  const validationRecords = certificate.domainValidationOptions.apply(
    (options) =>
      options.map((option) => ({
        name: option.resourceRecordName,
        type: option.resourceRecordType,
        value: option.resourceRecordValue,
      }))
  );

  // If Route53 hosted zone is provided, create validation records automatically
  let certificateValidation: aws.acm.CertificateValidation | undefined;

  if (config.hostedZoneId) {
    // Create validation record in Route53
    const validationRecord = new aws.route53.Record(
      "wraps-email-tracking-cert-validation",
      {
        zoneId: config.hostedZoneId,
        name: certificate.domainValidationOptions[0].resourceRecordName,
        type: certificate.domainValidationOptions[0].resourceRecordType,
        records: [certificate.domainValidationOptions[0].resourceRecordValue],
        ttl: 60,
      }
    );

    // Wait for certificate validation to complete
    certificateValidation = new aws.acm.CertificateValidation(
      "wraps-email-tracking-cert-validation-waiter",
      {
        certificateArn: certificate.arn,
        validationRecordFqdns: [validationRecord.fqdn],
      },
      {
        provider: usEast1Provider,
      }
    );
  }
  // For manual DNS: certificateValidation is undefined
  // User must add DNS records manually and run upgrade again

  return {
    certificate,
    certificateValidation,
    validationRecords,
  };
}
