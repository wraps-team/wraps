/**
 * AWS SES Mailbox Simulator test addresses
 *
 * These email addresses can be used to test different SES event scenarios
 * without affecting real email addresses or your sender reputation.
 *
 * @see https://docs.aws.amazon.com/ses/latest/dg/send-an-email-from-console.html
 * @see https://docs.aws.amazon.com/ses/latest/dg/send-email-simulator.html
 */

/**
 * AWS SES Mailbox Simulator addresses for testing different scenarios
 */
export const SES_SIMULATOR_ADDRESSES = {
  /**
   * Successful delivery scenario
   * - The recipient's email provider accepts your email
   * - Generates a Delivery event
   * - Can also test Open and Click events when tracking is enabled
   */
  SUCCESS: "success@simulator.amazonses.com",

  /**
   * Bounce scenario
   * - The recipient's email provider rejects your email
   * - Generates SMTP 550 5.1.1 ("Unknown User") response code
   * - Creates a Bounce event with bounceType: "Permanent" and bounceSubType: "General"
   * - Useful for testing bounce handling and suppression list functionality
   */
  BOUNCE: "bounce@simulator.amazonses.com",

  /**
   * Out-of-office auto-response scenario
   * - The recipient's email provider accepts your email and delivers it
   * - Generates an automatic out-of-office reply
   * - Useful for testing auto-response handling
   */
  OOTO: "ooto@simulator.amazonses.com",

  /**
   * Complaint scenario
   * - The recipient's email provider accepts your email and delivers it
   * - Simulates the recipient marking the email as spam
   * - Generates a Complaint event
   * - Useful for testing complaint handling and suppression list functionality
   */
  COMPLAINT: "complaint@simulator.amazonses.com",

  /**
   * Suppression list scenario
   * - Amazon SES generates a hard bounce as if the recipient's address is on the SES suppression list
   * - Creates a Bounce event with bounceType: "Permanent" and bounceSubType: "Suppressed"
   * - Useful for testing suppression list integration
   */
  SUPPRESSION_LIST: "suppressionlist@simulator.amazonses.com",
} as const;

/**
 * Type for simulator address keys
 */
export type SimulatorAddressKey = keyof typeof SES_SIMULATOR_ADDRESSES;

/**
 * Type for simulator address values
 */
export type SimulatorAddress =
  (typeof SES_SIMULATOR_ADDRESSES)[SimulatorAddressKey];

/**
 * Check if an email address is a SES simulator address
 */
export function isSimulatorAddress(email: string): boolean {
  return Object.values(SES_SIMULATOR_ADDRESSES).includes(
    email as SimulatorAddress
  );
}

/**
 * Get the scenario type for a simulator address
 */
export function getSimulatorScenario(
  email: string
): SimulatorAddressKey | null {
  for (const [key, value] of Object.entries(SES_SIMULATOR_ADDRESSES)) {
    if (value === email) {
      return key as SimulatorAddressKey;
    }
  }
  return null;
}

/**
 * Simulator scenario descriptions for documentation and logging
 */
export const SIMULATOR_SCENARIOS = {
  SUCCESS: {
    name: "Successful Delivery",
    description:
      "The recipient's email provider accepts your email and delivers it successfully",
    expectedEvents: ["Send", "Delivery"],
    optionalEvents: ["Open", "Click"],
  },
  BOUNCE: {
    name: "Permanent Bounce",
    description: "Email bounces with SMTP 550 5.1.1 Unknown User response",
    expectedEvents: ["Send", "Bounce"],
    bounceType: "Permanent",
    bounceSubType: "General",
  },
  OOTO: {
    name: "Out of Office",
    description:
      "Email delivered successfully with automatic out-of-office response",
    expectedEvents: ["Send", "Delivery"],
    note: "May generate an auto-response email back to the sender",
  },
  COMPLAINT: {
    name: "Spam Complaint",
    description: "Email delivered but recipient marks it as spam",
    expectedEvents: ["Send", "Delivery", "Complaint"],
    note: "Simulates recipient clicking 'Report Spam' or 'Mark as Junk'",
  },
  SUPPRESSION_LIST: {
    name: "Suppression List",
    description:
      "Email rejected because address is on the SES suppression list",
    expectedEvents: ["Send", "Bounce"],
    bounceType: "Permanent",
    bounceSubType: "Suppressed",
  },
} as const;

/**
 * All simulator addresses as an array
 */
export const ALL_SIMULATOR_ADDRESSES = Object.values(SES_SIMULATOR_ADDRESSES);

/**
 * Regex pattern to match any simulator address
 */
export const SIMULATOR_ADDRESS_PATTERN = /@simulator\.amazonses\.com$/i;

/**
 * Validate if an email matches the simulator address pattern
 */
export function matchesSimulatorPattern(email: string): boolean {
  return SIMULATOR_ADDRESS_PATTERN.test(email);
}
