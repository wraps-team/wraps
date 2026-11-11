import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  getSMSPhoneNumbers,
  getSMSRegistrations,
  getSMSSpendLimits,
} from "@/lib/aws/sms-voice";
import { createRequestLogger } from "@/lib/logger";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export type PhoneNumberInfo = {
  phoneNumber: string;
  phoneNumberArn: string;
  numberType: string;
  status: string;
  capabilities: string[];
  twoWayEnabled: boolean;
  selfManagedOptOutsEnabled: boolean;
  isoCountryCode: string;
  messageType: string;
  monthlyLeasingPrice: string;
};

export type RegistrationInfo = {
  registrationArn: string;
  registrationId: string;
  registrationType: string;
  registrationStatus: string;
  approvedVersionNumber?: number;
  latestDeniedVersionNumber?: number;
  additionalAttributes?: Record<string, string>;
  createdTimestamp: string;
};

export type SpendLimitInfo = {
  name: string;
  enforcedLimit: number;
  maxLimit: number;
  overridden: boolean;
};

export type SMSStatusResponse = {
  phoneNumbers: PhoneNumberInfo[];
  registrations: RegistrationInfo[];
  spendLimits: SpendLimitInfo[];
  hasSMSInfrastructure: boolean;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/sms/status",
      method: "GET",
      orgSlug,
    });

    // Authenticate user
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify organization membership
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only SMS-enabled accounts: the console role carries no sms-voice
    // permissions otherwise, so every read below would be AccessDenied (and
    // reported to Sentry) by design. Same gate as the products route.
    const accounts = await db.query.awsAccount.findMany({
      where: and(
        eq(awsAccount.organizationId, orgWithMembership.id),
        eq(awsAccount.smsEnabled, true)
      ),
    });

    if (accounts.length === 0) {
      return NextResponse.json<SMSStatusResponse>({
        phoneNumbers: [],
        registrations: [],
        spendLimits: [],
        hasSMSInfrastructure: false,
      });
    }

    // Fetch SMS data for all accounts in parallel
    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const [phoneNumbers, registrations, spendLimits] = await Promise.all([
            getSMSPhoneNumbers({
              awsAccountId: account.id,
              organizationId: orgWithMembership.id,
            }),
            getSMSRegistrations({
              awsAccountId: account.id,
              organizationId: orgWithMembership.id,
            }),
            getSMSSpendLimits({
              awsAccountId: account.id,
              organizationId: orgWithMembership.id,
            }),
          ]);
          return { phoneNumbers, registrations, spendLimits };
        } catch (error) {
          log.error(
            {
              err: error,
              accountId: account.id,
              awsAccountId: account.accountId,
              roleArn: account.roleArn,
              region: account.region,
            },
            "Failed to fetch SMS status for account"
          );
          return { phoneNumbers: [], registrations: [], spendLimits: [] };
        }
      })
    );

    // Aggregate results from all accounts
    const allPhoneNumbers: PhoneNumberInfo[] = [];
    const allRegistrations: RegistrationInfo[] = [];
    const allSpendLimits: SpendLimitInfo[] = [];

    for (const result of results) {
      // Map phone numbers
      for (const phone of result.phoneNumbers) {
        allPhoneNumbers.push({
          phoneNumber: phone.PhoneNumber || "",
          phoneNumberArn: phone.PhoneNumberArn || "",
          numberType: phone.NumberType || "UNKNOWN",
          status: phone.Status || "UNKNOWN",
          capabilities: phone.NumberCapabilities || [],
          twoWayEnabled: phone.TwoWayEnabled ?? false,
          selfManagedOptOutsEnabled: phone.SelfManagedOptOutsEnabled ?? false,
          isoCountryCode: phone.IsoCountryCode || "",
          messageType: phone.MessageType || "TRANSACTIONAL",
          monthlyLeasingPrice: phone.MonthlyLeasingPrice || "0.00",
        });
      }

      // Map registrations
      for (const reg of result.registrations) {
        allRegistrations.push({
          registrationArn: reg.RegistrationArn || "",
          registrationId: reg.RegistrationId || "",
          registrationType: reg.RegistrationType || "UNKNOWN",
          registrationStatus: reg.RegistrationStatus || "UNKNOWN",
          approvedVersionNumber: reg.ApprovedVersionNumber,
          latestDeniedVersionNumber: reg.LatestDeniedVersionNumber,
          additionalAttributes: reg.AdditionalAttributes,
          createdTimestamp: reg.CreatedTimestamp?.toISOString() || "",
        });
      }

      // Map spend limits
      for (const limit of result.spendLimits) {
        allSpendLimits.push({
          name: limit.Name || "UNKNOWN",
          enforcedLimit: limit.EnforcedLimit || 0,
          maxLimit: limit.MaxLimit || 0,
          overridden: limit.Overridden ?? false,
        });
      }
    }

    const hasSMSInfrastructure = allPhoneNumbers.length > 0;

    return NextResponse.json<SMSStatusResponse>({
      phoneNumbers: allPhoneNumbers,
      registrations: allRegistrations,
      spendLimits: allSpendLimits,
      hasSMSInfrastructure,
    });
  } catch (error) {
    const log = createRequestLogger({
      path: "/api/[orgSlug]/analytics/sms/status",
      method: "GET",
    });
    log.error({ err: error }, "Error fetching SMS status");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
