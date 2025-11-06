import * as aws from '@pulumi/aws';

/**
 * Vercel OIDC configuration
 */
export interface VercelOIDCConfig {
  teamSlug: string;
  accountId: string;
}

/**
 * Create Vercel OIDC provider for AssumeRoleWithWebIdentity
 */
export async function createVercelOIDC(
  config: VercelOIDCConfig
): Promise<aws.iam.OpenIdConnectProvider> {
  return new aws.iam.OpenIdConnectProvider('byo-vercel-oidc', {
    url: `https://oidc.vercel.com/${config.teamSlug}`,
    clientIdLists: [`https://vercel.com/${config.teamSlug}`],
    thumbprintLists: [
      // Vercel OIDC thumbprints
      '20032e77eca0785eece16b56b42c9b330b906320',
      '696db3af0dffc17e65c6a20d925c5a7bd24dec7e',
    ],
    tags: {
      ManagedBy: 'byo-cli',
      Provider: 'vercel',
    },
  });
}
