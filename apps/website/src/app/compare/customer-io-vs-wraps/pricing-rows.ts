import {
  savingsDollars,
  savingsPercent,
  wrapsAllIn,
} from "@/app/compare/components/wraps-cost";
import {
  CONTACT_PRICE_ROWS,
  CUSTOMER_IO_ESSENTIALS,
} from "@/config/competitor-contact-pricing";
import type { TierId } from "@/config/pricing";

const { minimum, includedProfiles, overagePerProfile } = CUSTOMER_IO_ESSENTIALS;

/**
 * Tier per row: Free where it covers the volume, Pro from 50K, Business at
 * 500K and above, as the page has always priced it.
 */
export const CUSTOMER_IO_INPUTS: {
  emails: number;
  contacts: number;
  tier: TierId;
}[] = [
  { emails: 10_000, contacts: 1000, tier: "free" },
  { emails: 50_000, contacts: 5000, tier: "pro" },
  { emails: 100_000, contacts: 10_000, tier: "pro" },
  { emails: 500_000, contacts: 50_000, tier: "business" },
  { emails: 1_000_000, contacts: 100_000, tier: "business" },
];

export function customerIoBill(contacts: number): number {
  if (contacts <= includedProfiles) {
    return minimum;
  }
  const row = CONTACT_PRICE_ROWS.find((r) => r.contacts === contacts);
  if (!row) {
    throw new Error(`No Customer.io figure for ${contacts} contacts`);
  }
  return row.customerIo;
}

export function customerIoNote(contacts: number): string {
  if (contacts < includedProfiles) {
    return "Essentials (5K profiles incl.)";
  }
  if (contacts === includedProfiles) {
    return "Essentials (at profile limit)";
  }
  const over = contacts - includedProfiles;
  return `$${minimum} + ${over / 1000}K overage at $${overagePerProfile}/profile`;
}

export function dollars(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

export const pricingRows = CUSTOMER_IO_INPUTS.map(
  ({ emails, contacts, tier }) => {
    const wraps = wrapsAllIn({ emails, tier });
    const cio = customerIoBill(contacts);
    return {
      volume: emails.toLocaleString("en-US"),
      contacts: contacts.toLocaleString("en-US"),
      competitor: `${dollars(cio)}/mo`,
      competitorNote: customerIoNote(contacts),
      wraps: `${wraps.totalLabel}/mo`,
      wrapsBreakdown: wraps.breakdown,
      savings: `${savingsDollars(cio, wraps.total)}/mo`,
      savingsNote: `${savingsPercent(cio, wraps.total)} less`,
    };
  }
);
