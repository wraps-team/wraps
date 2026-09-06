/**
 * The exact sentence a contact agrees to when they tick the SMS box.
 *
 * Stored verbatim in the audit log alongside the consent, because "what did
 * they actually agree to" is the question a consent record has to answer, and
 * copy changes over time.
 *
 * Deliberately makes no reply-to-a-keyword-to-opt-out promise: there is no
 * inbound-SMS handler in this product, so nothing would write `opted_out` in
 * response to one. The preference center itself is the withdrawal mechanism,
 * and that is what this text points at.
 *
 * This module is imported by a client component. Keep it import-free: a value
 * import from `@wraps/db` here drags `pg` into the browser bundle and fails
 * `pnpm --filter @wraps/web build`.
 */
export const SMS_CONSENT_TEXT =
  "Send me text messages. Message and data rates may apply. You can turn this off at any time on this page.";

/** Last four digits only — enough for the contact to recognise the number. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? phone : `•••• ${digits.slice(-4)}`;
}
