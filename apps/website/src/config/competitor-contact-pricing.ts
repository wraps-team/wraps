// Competitor platform fees by list size, the one source for every chart and
// table that compares a per-contact bill with Wraps' flat plan fee. Never copy
// these numbers into a page; import them. Platform fee only: sending is billed
// separately (Amazon bills Wraps customers directly).
//
// Customer.io Essentials $100/mo per 5K profiles then $0.009/profile;
// Klaviyo $150 @10K, $720 @50K, $1,380 @100K profiles.

export type ContactPriceRow = {
  contacts: number;
  customerIo: number;
  klaviyo: number;
};

export const CONTACT_PRICE_ROWS: ContactPriceRow[] = [
  { contacts: 5000, customerIo: 100, klaviyo: 100 },
  { contacts: 10_000, customerIo: 145, klaviyo: 150 },
  { contacts: 50_000, customerIo: 505, klaviyo: 720 },
  { contacts: 100_000, customerIo: 955, klaviyo: 1380 },
];

/** When the competitor figures were last checked (the compare pages' date). */
export const CONTACT_PRICES_CHECKED = "September 2026";

/** Klaviyo's entry bill, at about 1,000 profiles (klaviyo.com/pricing). */
export const KLAVIYO_ENTRY = { contacts: 1000, price: 30 };

/**
 * Customer.io Essentials (customer.io/pricing): the minimum covers
 * `includedProfiles`, then each extra profile costs `overagePerProfile`.
 * `CONTACT_PRICE_ROWS` above must equal minimum + overage at every size.
 */
export const CUSTOMER_IO_ESSENTIALS = {
  minimum: 100,
  includedProfiles: 5000,
  overagePerProfile: 0.009,
};
