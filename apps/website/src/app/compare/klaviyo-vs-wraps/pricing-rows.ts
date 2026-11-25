import {
  savingsMultiple,
  wrapsAllIn,
} from "@/app/compare/components/wraps-cost";
import {
  CONTACT_PRICE_ROWS,
  KLAVIYO_ENTRY,
} from "@/config/competitor-contact-pricing";
import type { TierId } from "@/config/pricing";

/**
 * Klaviyo bills by profile. The 5K to 100K bills are the shared constants; the
 * ~1,000 profile bill is `KLAVIYO_ENTRY`. Tier per row: Free where it covers
 * the volume, Pro above.
 */
export const KLAVIYO_INPUTS: {
  emails: number;
  contacts: number;
  tier: TierId;
}[] = [
  { emails: 10_000, contacts: 1000, tier: "free" },
  { emails: 50_000, contacts: 5000, tier: "pro" },
  { emails: 100_000, contacts: 10_000, tier: "pro" },
  { emails: 500_000, contacts: 50_000, tier: "pro" },
  { emails: 1_000_000, contacts: 100_000, tier: "pro" },
];

export function klaviyoBill(contacts: number): number {
  if (contacts === KLAVIYO_ENTRY.contacts) {
    return KLAVIYO_ENTRY.price;
  }
  const row = CONTACT_PRICE_ROWS.find((r) => r.contacts === contacts);
  if (!row) {
    throw new Error(`No Klaviyo figure for ${contacts} contacts`);
  }
  return row.klaviyo;
}

export function dollars(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

export const pricingRows = KLAVIYO_INPUTS.map(({ emails, contacts, tier }) => {
  const wraps = wrapsAllIn({ emails, tier });
  const klaviyo = klaviyoBill(contacts);
  return {
    volume: emails.toLocaleString("en-US"),
    contacts: `~${contacts.toLocaleString("en-US")}`,
    competitor: `${dollars(klaviyo)}/mo`,
    wraps: `${wraps.totalLabel}/mo`,
    wrapsBreakdown: wraps.breakdown,
    savings: savingsMultiple(klaviyo, wraps.total),
    savingsNote: "as much as Wraps",
  };
});
