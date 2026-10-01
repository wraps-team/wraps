import {
  GetEmailIdentityCommand,
  type GetEmailIdentityCommandOutput,
  type IdentityInfo,
  ListEmailIdentitiesCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import type { SESCredentials } from "./ses-templates";

export type WrapsIdentity = {
  identity: string;
  type: "DOMAIN" | "EMAIL_ADDRESS";
  configSetName?: string;
};

function createSESClient(
  credentials: SESCredentials,
  region: string
): SESv2Client {
  return new SESv2Client({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });
}

/**
 * The single rule for "this identity belongs in the snapshot": sending-enabled,
 * verified for sending, and wired to a Wraps config set. Pure; no AWS calls.
 */
export function toWrapsIdentity(
  entry: Pick<IdentityInfo, "IdentityName" | "IdentityType" | "SendingEnabled">,
  details: Pick<
    GetEmailIdentityCommandOutput,
    "VerifiedForSendingStatus" | "ConfigurationSetName"
  >
): WrapsIdentity | null {
  if (
    !(
      entry.SendingEnabled &&
      details.VerifiedForSendingStatus &&
      details.ConfigurationSetName?.startsWith("wraps-email-")
    )
  ) {
    return null;
  }
  return {
    identity: entry.IdentityName!,
    type: entry.IdentityType as "DOMAIN" | "EMAIL_ADDRESS",
    // Stored so sends can resolve the set by lookup, never derive it.
    configSetName: details.ConfigurationSetName,
  };
}

/** Full scan: ListEmailIdentities(PageSize 100) then GetEmailIdentity per sending-enabled entry. */
export async function scanWrapsIdentities(
  credentials: SESCredentials,
  region: string
): Promise<WrapsIdentity[]> {
  const ses = createSESClient(credentials, region);
  const identities: WrapsIdentity[] = [];

  const listResponse = await ses.send(
    new ListEmailIdentitiesCommand({ PageSize: 100 })
  );
  const sendingEnabled =
    listResponse.EmailIdentities?.filter((i) => i.SendingEnabled) ?? [];

  for (const entry of sendingEnabled) {
    try {
      const details = await ses.send(
        new GetEmailIdentityCommand({ EmailIdentity: entry.IdentityName })
      );
      const found = toWrapsIdentity(entry, details);
      if (found) {
        identities.push(found);
      }
    } catch {
      // Skip identities we can't access
    }
  }
  return identities;
}

/** One identity: GetEmailIdentity(name). Returns null when absent (NotFoundException) or not a Wraps identity. */
export async function getWrapsIdentity(
  credentials: SESCredentials,
  region: string,
  name: string
): Promise<WrapsIdentity | null> {
  const ses = createSESClient(credentials, region);
  try {
    const details = await ses.send(
      new GetEmailIdentityCommand({ EmailIdentity: name })
    );
    return toWrapsIdentity(
      {
        IdentityName: name,
        IdentityType: details.IdentityType,
        SendingEnabled: true,
      },
      details
    );
  } catch (error) {
    if ((error as { name?: string }).name === "NotFoundException") {
      return null;
    }
    throw error;
  }
}
