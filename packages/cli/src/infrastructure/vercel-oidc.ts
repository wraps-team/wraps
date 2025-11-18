import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/**
 * Vercel OIDC configuration
 */
export type VercelOIDCConfig = {
  teamSlug: string;
  accountId: string;
};

/**
 * Get existing OIDC provider ARN by URL
 */
async function getExistingOIDCProviderArn(
  url: string,
  accountId: string
): Promise<string | null> {
  try {
    const { IAMClient, ListOpenIDConnectProvidersCommand } = await import(
      "@aws-sdk/client-iam"
    );
    const iam = new IAMClient({});

    const response = await iam.send(new ListOpenIDConnectProvidersCommand({}));

    // Find provider by ARN pattern (ARN includes the URL)
    // Format: arn:aws:iam::ACCOUNT:oidc-provider/oidc.vercel.com/TEAM
    const expectedArnSuffix = url.replace("https://", "");
    const provider = response.OpenIDConnectProviderList?.find((p) =>
      p.Arn?.endsWith(expectedArnSuffix)
    );

    return provider?.Arn || null;
  } catch (error) {
    console.error("Error checking for existing OIDC provider:", error);
    return null;
  }
}

/**
 * Create or get existing Vercel OIDC provider for AssumeRoleWithWebIdentity
 */
export async function createVercelOIDC(
  config: VercelOIDCConfig
): Promise<aws.iam.OpenIdConnectProvider> {
  const url = `https://oidc.vercel.com/${config.teamSlug}`;

  // Check if OIDC provider already exists
  const existingArn = await getExistingOIDCProviderArn(url, config.accountId);

  if (existingArn) {
    // Import existing OIDC provider instead of creating new one
    return new aws.iam.OpenIdConnectProvider(
      "wraps-vercel-oidc",
      {
        url,
        clientIdLists: [`https://vercel.com/${config.teamSlug}`],
        thumbprintLists: [
          // Vercel OIDC thumbprints
          "20032e77eca0785eece16b56b42c9b330b906320",
          "696db3af0dffc17e65c6a20d925c5a7bd24dec7e",
        ],
        tags: {
          ManagedBy: "wraps-cli",
          Provider: "vercel",
        },
      },
      {
        import: existingArn, // Import existing resource
      }
    );
  }

  // Create new OIDC provider if it doesn't exist
  return new aws.iam.OpenIdConnectProvider("wraps-vercel-oidc", {
    url,
    clientIdLists: [`https://vercel.com/${config.teamSlug}`],
    thumbprintLists: [
      // Vercel OIDC thumbprints
      "20032e77eca0785eece16b56b42c9b330b906320",
      "696db3af0dffc17e65c6a20d925c5a7bd24dec7e",
    ],
    tags: {
      ManagedBy: "wraps-cli",
      Provider: "vercel",
    },
  });
}
