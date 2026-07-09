import {
  type Change,
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
  ListResourceRecordSetsCommand,
  type ResourceRecordSet,
  Route53Client,
} from "@aws-sdk/client-route-53";

/**
 * Proposed DNS record with conflict detection info
 */
export type ProposedDNSRecord = {
  name: string;
  type: "CNAME" | "TXT" | "MX";
  proposedValue: string;
  existingValue: string | null;
  status: "new" | "update" | "conflict" | "no_change";
  category:
    | "dkim"
    | "spf"
    | "dmarc"
    | "tracking"
    | "mailfrom_mx"
    | "mailfrom_spf"
    | "inbound_mx"
    | "inbound_spf";
  conflictReason?: string;
};

/**
 * DNS preview result with all proposed changes
 */
export type DNSPreviewResult = {
  records: ProposedDNSRecord[];
  hasConflicts: boolean;
  conflictCount: number;
  newCount: number;
  updateCount: number;
  noChangeCount: number;
};

/**
 * Get existing TXT records for a domain
 * Returns all TXT record values and identifies which one is SPF
 */
async function getExistingTXTRecords(
  client: Route53Client,
  hostedZoneId: string,
  domain: string
): Promise<{ allValues: string[]; spfValue: string | null; ttl: number }> {
  try {
    const response = await client.send(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        StartRecordName: domain,
        StartRecordType: "TXT",
        MaxItems: 100,
      })
    );

    // Find TXT records for the exact domain
    const txtRecordSet = response.ResourceRecordSets?.find(
      (rs) =>
        rs.Type === "TXT" && (rs.Name === domain || rs.Name === `${domain}.`)
    );

    if (!txtRecordSet?.ResourceRecords) {
      return { allValues: [], spfValue: null, ttl: 1800 };
    }

    const allValues: string[] = [];
    let spfValue: string | null = null;

    for (const record of txtRecordSet.ResourceRecords) {
      const value = record.Value || "";
      allValues.push(value);

      // Check if this is the SPF record (strip quotes for comparison)
      const unquoted = value.replace(/^"|"$/g, "");
      if (unquoted.startsWith("v=spf1")) {
        spfValue = unquoted;
      }
    }

    return {
      allValues,
      spfValue,
      ttl: txtRecordSet.TTL || 1800,
    };
  } catch (_error) {
    return { allValues: [], spfValue: null, ttl: 1800 };
  }
}

/**
 * Merge amazonses.com include into an existing SPF record
 * If the record already includes amazonses.com, returns unchanged
 */
function mergeSPFRecord(existingSPF: string): string {
  const sesInclude = "include:amazonses.com";

  // Already includes SES
  if (existingSPF.includes(sesInclude)) {
    return existingSPF;
  }

  // Find the position before the "all" mechanism to insert our include
  // SPF format: v=spf1 [mechanisms...] [qualifier]all
  const allMatch = existingSPF.match(/\s([~+?-]?all)$/);

  if (allMatch) {
    // Insert before the "all" mechanism
    const beforeAll = existingSPF.slice(0, allMatch.index);
    const allPart = allMatch[1];
    return `${beforeAll} ${sesInclude} ${allPart}`;
  }

  // No "all" mechanism found, append to end
  return `${existingSPF} ${sesInclude}`;
}

// Export for testing
export { mergeSPFRecord };

/**
 * Get all existing records from a hosted zone for comparison
 */
async function getExistingRecords(
  client: Route53Client,
  hostedZoneId: string
): Promise<ResourceRecordSet[]> {
  try {
    const response = await client.send(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        MaxItems: 500,
      })
    );
    return response.ResourceRecordSets || [];
  } catch (_error) {
    return [];
  }
}

/**
 * Find an existing record by name and type
 */
function findExistingRecord(
  records: ResourceRecordSet[],
  name: string,
  type: string
): ResourceRecordSet | null {
  const normalizedName = name.endsWith(".") ? name : `${name}.`;
  return (
    records.find((r) => r.Name === normalizedName && r.Type === type) || null
  );
}

/**
 * Extract the value(s) from a record set as a string
 */
function getRecordValue(record: ResourceRecordSet | null): string | null {
  if (!record?.ResourceRecords?.length) {
    return null;
  }
  return record.ResourceRecords.map((r) => r.Value || "").join(", ");
}

/**
 * Preview DNS changes before applying them
 * Returns detailed info about what will be created, updated, or conflict
 */
export async function previewDNSChanges(
  hostedZoneId: string,
  domain: string,
  dkimTokens: string[],
  region: string,
  customTrackingDomain?: string,
  mailFromDomain?: string
): Promise<DNSPreviewResult> {
  const client = new Route53Client({ region });
  const existingRecords = await getExistingRecords(client, hostedZoneId);
  const existingTXT = await getExistingTXTRecords(client, hostedZoneId, domain);

  const records: ProposedDNSRecord[] = [];

  // DKIM CNAME records
  for (const token of dkimTokens) {
    const name = `${token}._domainkey.${domain}`;
    const proposedValue = `${token}.dkim.amazonses.com`;
    const existing = findExistingRecord(existingRecords, name, "CNAME");
    const existingValue = getRecordValue(existing);

    let status: ProposedDNSRecord["status"] = "new";
    if (existingValue === proposedValue) {
      status = "no_change";
    } else if (existingValue) {
      status = "update";
    }

    records.push({
      name,
      type: "CNAME",
      proposedValue,
      existingValue,
      status,
      category: "dkim",
    });
  }

  // SPF record - check for conflicts with existing SPF
  const proposedSPF = existingTXT.spfValue
    ? mergeSPFRecord(existingTXT.spfValue)
    : "v=spf1 include:amazonses.com ~all";

  let spfStatus: ProposedDNSRecord["status"] = "new";

  if (existingTXT.spfValue) {
    if (existingTXT.spfValue === proposedSPF) {
      spfStatus = "no_change";
    } else if (existingTXT.spfValue.includes("include:amazonses.com")) {
      spfStatus = "no_change"; // Already has SES
    } else {
      // We're modifying an existing SPF - this is a merge, show as update
      spfStatus = "update";
    }
  }

  records.push({
    name: domain,
    type: "TXT",
    proposedValue: `"${proposedSPF}"`,
    existingValue: existingTXT.spfValue ? `"${existingTXT.spfValue}"` : null,
    status: spfStatus,
    category: "spf",
    conflictReason: undefined,
  });

  // DMARC record - check for existing DMARC
  const dmarcName = `_dmarc.${domain}`;
  const dmarcRuaDomain = mailFromDomain || domain;
  const proposedDMARC = `"v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:postmaster@${dmarcRuaDomain}"`;
  const existingDMARC = findExistingRecord(existingRecords, dmarcName, "TXT");
  const existingDMARCValue = getRecordValue(existingDMARC);

  let dmarcStatus: ProposedDNSRecord["status"] = "new";
  let dmarcConflictReason: string | undefined;

  if (existingDMARCValue) {
    // Check if it's the same
    if (existingDMARCValue === proposedDMARC) {
      dmarcStatus = "no_change";
    } else {
      // Existing DMARC will be replaced - this is a conflict!
      dmarcStatus = "conflict";
      dmarcConflictReason = "Existing DMARC policy will be replaced";
    }
  }

  records.push({
    name: dmarcName,
    type: "TXT",
    proposedValue: proposedDMARC,
    existingValue: existingDMARCValue,
    status: dmarcStatus,
    category: "dmarc",
    conflictReason: dmarcConflictReason,
  });

  // Custom tracking domain CNAME
  if (customTrackingDomain) {
    const proposedTracking = `r.${region}.awstrack.me`;
    const existingTracking = findExistingRecord(
      existingRecords,
      customTrackingDomain,
      "CNAME"
    );
    const existingTrackingValue = getRecordValue(existingTracking);

    let trackingStatus: ProposedDNSRecord["status"] = "new";
    let trackingConflictReason: string | undefined;

    if (existingTrackingValue === proposedTracking) {
      trackingStatus = "no_change";
    } else if (existingTrackingValue) {
      trackingStatus = "conflict";
      trackingConflictReason = `Points to ${existingTrackingValue}, will be replaced`;
    }

    records.push({
      name: customTrackingDomain,
      type: "CNAME",
      proposedValue: proposedTracking,
      existingValue: existingTrackingValue,
      status: trackingStatus,
      category: "tracking",
      conflictReason: trackingConflictReason,
    });
  }

  // MAIL FROM domain records
  if (mailFromDomain) {
    // MX record
    const proposedMX = `10 feedback-smtp.${region}.amazonses.com`;
    const existingMX = findExistingRecord(
      existingRecords,
      mailFromDomain,
      "MX"
    );
    const existingMXValue = getRecordValue(existingMX);

    let mxStatus: ProposedDNSRecord["status"] = "new";
    if (existingMXValue === proposedMX) {
      mxStatus = "no_change";
    } else if (existingMXValue) {
      mxStatus = "update";
    }

    records.push({
      name: mailFromDomain,
      type: "MX",
      proposedValue: proposedMX,
      existingValue: existingMXValue,
      status: mxStatus,
      category: "mailfrom_mx",
    });

    // SPF for MAIL FROM subdomain
    const mailFromSPF = '"v=spf1 include:amazonses.com ~all"';
    const existingMailFromTXT = await getExistingTXTRecords(
      client,
      hostedZoneId,
      mailFromDomain
    );

    let mailFromSpfStatus: ProposedDNSRecord["status"] = "new";
    if (existingMailFromTXT.spfValue?.includes("include:amazonses.com")) {
      mailFromSpfStatus = "no_change";
    } else if (existingMailFromTXT.spfValue) {
      mailFromSpfStatus = "update";
    }

    records.push({
      name: mailFromDomain,
      type: "TXT",
      proposedValue: mailFromSPF,
      existingValue: existingMailFromTXT.spfValue
        ? `"${existingMailFromTXT.spfValue}"`
        : null,
      status: mailFromSpfStatus,
      category: "mailfrom_spf",
    });
  }

  // Count statuses
  const conflictCount = records.filter((r) => r.status === "conflict").length;
  const newCount = records.filter((r) => r.status === "new").length;
  const updateCount = records.filter((r) => r.status === "update").length;
  const noChangeCount = records.filter((r) => r.status === "no_change").length;

  return {
    records,
    hasConflicts: conflictCount > 0,
    conflictCount,
    newCount,
    updateCount,
    noChangeCount,
  };
}

/**
 * Create selected DNS records in Route53
 * Only creates records that are in the selectedRecords set
 */
export async function createSelectedDNSRecords(
  hostedZoneId: string,
  domain: string,
  dkimTokens: string[],
  region: string,
  selectedCategories: Set<ProposedDNSRecord["category"]>,
  customTrackingDomain?: string,
  mailFromDomain?: string
): Promise<void> {
  const client = new Route53Client({ region });
  const changes: Change[] = [];

  // DKIM CNAME records
  if (selectedCategories.has("dkim")) {
    for (const token of dkimTokens) {
      changes.push({
        Action: "UPSERT",
        ResourceRecordSet: {
          Name: `${token}._domainkey.${domain}`,
          Type: "CNAME",
          TTL: 1800,
          ResourceRecords: [{ Value: `${token}.dkim.amazonses.com` }],
        },
      });
    }
  }

  // SPF TXT record
  if (selectedCategories.has("spf")) {
    const existingTXT = await getExistingTXTRecords(
      client,
      hostedZoneId,
      domain
    );
    const newTXTValues: string[] = [];

    if (existingTXT.spfValue) {
      const mergedSPF = mergeSPFRecord(existingTXT.spfValue);
      newTXTValues.push(`"${mergedSPF}"`);
      for (const value of existingTXT.allValues) {
        const unquoted = value.replace(/^"|"$/g, "");
        if (!unquoted.startsWith("v=spf1")) {
          newTXTValues.push(value);
        }
      }
    } else if (existingTXT.allValues.length > 0) {
      newTXTValues.push('"v=spf1 include:amazonses.com ~all"');
      newTXTValues.push(...existingTXT.allValues);
    } else {
      newTXTValues.push('"v=spf1 include:amazonses.com ~all"');
    }

    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: domain,
        Type: "TXT",
        TTL: existingTXT.ttl,
        ResourceRecords: newTXTValues.map((v) => ({ Value: v })),
      },
    });
  }

  // DMARC TXT record
  if (selectedCategories.has("dmarc")) {
    const dmarcRuaDomain = mailFromDomain || domain;
    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: `_dmarc.${domain}`,
        Type: "TXT",
        TTL: 1800,
        ResourceRecords: [
          {
            Value: `"v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:postmaster@${dmarcRuaDomain}"`,
          },
        ],
      },
    });
  }

  // Custom tracking domain CNAME
  if (selectedCategories.has("tracking") && customTrackingDomain) {
    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: customTrackingDomain,
        Type: "CNAME",
        TTL: 1800,
        ResourceRecords: [{ Value: `r.${region}.awstrack.me` }],
      },
    });
  }

  // MAIL FROM domain records
  if (selectedCategories.has("mailfrom_mx") && mailFromDomain) {
    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: mailFromDomain,
        Type: "MX",
        TTL: 1800,
        ResourceRecords: [
          { Value: `10 feedback-smtp.${region}.amazonses.com` },
        ],
      },
    });
  }

  if (selectedCategories.has("mailfrom_spf") && mailFromDomain) {
    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: mailFromDomain,
        Type: "TXT",
        TTL: 1800,
        ResourceRecords: [{ Value: '"v=spf1 include:amazonses.com ~all"' }],
      },
    });
  }

  if (changes.length === 0) {
    return; // Nothing to create
  }

  await client.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: changes,
      },
    })
  );
}

/**
 * Find Route53 hosted zone for a domain
 */
export async function findHostedZone(
  domain: string,
  region: string
): Promise<{ id: string; name: string } | null> {
  const client = new Route53Client({ region });

  try {
    const response = await client.send(
      new ListHostedZonesByNameCommand({
        DNSName: domain,
        MaxItems: 1,
      })
    );

    const zone = response.HostedZones?.[0];
    if (zone && zone.Name === `${domain}.` && zone.Id) {
      return {
        id: zone.Id.replace("/hostedzone/", ""),
        name: zone.Name,
      };
    }

    return null;
  } catch (_error) {
    return null;
  }
}

/**
 * Create DNS records in Route53
 */
export async function createDNSRecords(
  hostedZoneId: string,
  domain: string,
  dkimTokens: string[],
  region: string,
  customTrackingDomain?: string,
  mailFromDomain?: string,
  cloudFrontDomain?: string
): Promise<void> {
  const client = new Route53Client({ region });

  const changes: Change[] = [];

  // DKIM CNAME records
  for (const token of dkimTokens) {
    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: `${token}._domainkey.${domain}`,
        Type: "CNAME",
        TTL: 1800,
        ResourceRecords: [{ Value: `${token}.dkim.amazonses.com` }],
      },
    });
  }

  // SPF TXT record - check for existing records and merge while preserving others
  const existingTXT = await getExistingTXTRecords(client, hostedZoneId, domain);

  // Build the new TXT record values, preserving all non-SPF records
  const newTXTValues: string[] = [];

  if (existingTXT.spfValue) {
    // Merge our include into the existing SPF record
    const mergedSPF = mergeSPFRecord(existingTXT.spfValue);
    newTXTValues.push(`"${mergedSPF}"`);

    // Add all other TXT values (non-SPF)
    for (const value of existingTXT.allValues) {
      const unquoted = value.replace(/^"|"$/g, "");
      if (!unquoted.startsWith("v=spf1")) {
        newTXTValues.push(value);
      }
    }
  } else if (existingTXT.allValues.length > 0) {
    // No SPF exists, add new SPF and keep all existing values
    newTXTValues.push('"v=spf1 include:amazonses.com ~all"');
    newTXTValues.push(...existingTXT.allValues);
  } else {
    // No TXT records exist, create new SPF
    newTXTValues.push('"v=spf1 include:amazonses.com ~all"');
  }

  changes.push({
    Action: "UPSERT",
    ResourceRecordSet: {
      Name: domain,
      Type: "TXT",
      TTL: existingTXT.ttl,
      ResourceRecords: newTXTValues.map((v) => ({ Value: v })),
    },
  });

  // DMARC TXT record
  // Use MAIL FROM domain for rua if configured, otherwise use main domain
  const dmarcRuaDomain = mailFromDomain || domain;
  changes.push({
    Action: "UPSERT",
    ResourceRecordSet: {
      Name: `_dmarc.${domain}`,
      Type: "TXT",
      TTL: 1800,
      ResourceRecords: [
        {
          Value: `"v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:postmaster@${dmarcRuaDomain}"`,
        },
      ],
    },
  });

  // Custom tracking domain CNAME (if provided)
  // This allows SES to rewrite links for open/click tracking using your custom domain
  if (customTrackingDomain) {
    // If CloudFront domain is provided, use it (HTTPS tracking)
    // Otherwise, use direct SES tracking endpoint (HTTP tracking)
    const targetDomain = cloudFrontDomain || `r.${region}.awstrack.me`;

    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: customTrackingDomain,
        Type: "CNAME",
        TTL: 1800,
        ResourceRecords: [{ Value: targetDomain }],
      },
    });
  }

  // MAIL FROM domain records (if provided)
  // These records enable DMARC alignment by using a custom subdomain for the envelope sender
  if (mailFromDomain) {
    // MX record pointing to SES feedback server
    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: mailFromDomain,
        Type: "MX",
        TTL: 1800,
        ResourceRecords: [
          { Value: `10 feedback-smtp.${region}.amazonses.com` },
        ],
      },
    });

    // SPF record for MAIL FROM domain
    changes.push({
      Action: "UPSERT",
      ResourceRecordSet: {
        Name: mailFromDomain,
        Type: "TXT",
        TTL: 1800,
        ResourceRecords: [{ Value: '"v=spf1 include:amazonses.com ~all"' }],
      },
    });
  }

  await client.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: changes,
      },
    })
  );
}

/**
 * Delete DNS records from Route53 that were created for SES
 */
export async function deleteDNSRecords(
  hostedZoneId: string,
  domain: string,
  dkimTokens: string[],
  region: string,
  customTrackingDomain?: string,
  mailFromDomain?: string
): Promise<void> {
  const client = new Route53Client({ region });

  // First, we need to get the current record values to delete them
  // Route53 DELETE requires exact match of the record
  const response = await client.send(
    new ListResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      MaxItems: 500,
    })
  );

  const recordSets = response.ResourceRecordSets || [];
  const changes: Change[] = [];

  // Helper to find and add deletion for a record
  const addDeletionIfExists = (name: string, type: string) => {
    // Route53 names end with a dot
    const normalizedName = name.endsWith(".") ? name : `${name}.`;
    const record = recordSets.find(
      (rs) => rs.Name === normalizedName && rs.Type === type
    );
    if (record?.ResourceRecords) {
      changes.push({
        Action: "DELETE",
        ResourceRecordSet: record,
      });
    }
  };

  // DKIM CNAME records
  for (const token of dkimTokens) {
    addDeletionIfExists(`${token}._domainkey.${domain}`, "CNAME");
  }

  // DMARC record
  addDeletionIfExists(`_dmarc.${domain}`, "TXT");

  // Custom tracking domain CNAME
  if (customTrackingDomain) {
    addDeletionIfExists(customTrackingDomain, "CNAME");
  }

  // MAIL FROM domain records
  if (mailFromDomain) {
    addDeletionIfExists(mailFromDomain, "MX");
    addDeletionIfExists(mailFromDomain, "TXT");
  }

  // Note: We don't delete the main domain SPF record as it might contain
  // other providers' includes. Users should manually remove amazonses.com
  // from their SPF if needed.

  if (changes.length === 0) {
    return; // Nothing to delete
  }

  await client.send(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: changes,
      },
    })
  );
}
