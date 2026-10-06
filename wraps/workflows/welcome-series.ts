import {
  condition,
  defineWorkflow,
  delay,
  exit,
  sendEmail,
} from "@wraps.dev/client";

/**
 * New Welcome Series
 *
 * Three emails at most, never two inside 24 hours:
 *
 *   +0    → Welcome: what Wraps is, the one command, the honest caveats
 *   Day 1 → Quickstart — only if AWS isn't connected yet
 *   Day 7 → Last call — only if AWS still isn't connected, then stop
 *
 * Cut down from a nine-email engagement split. Across every onboarding flow
 * since January (337 sends to 119 signups), the one email that ever brought
 * someone back was a single "here's the quickstart" follow-up; the rest drew
 * more unsubscribe clicks than setup clicks. Fewer, later, conditional.
 *
 * `hasConnectedAws` is set on every connect path (CLI, dashboard and both
 * CloudFormation routes), so the day-1 and day-7 emails can assume the reader
 * hasn't connected yet.
 *
 * Onboarding Rescue and both Activation Drips were deleted in favour of this
 * flow. They are still paused in the dashboard; leave them that way, or
 * signups get mailed twice.
 */
export default defineWorkflow({
  name: "New Welcome Series",
  description:
    "Welcome at signup, a quickstart on day 1 and a last call on day 7 for anyone who hasn't connected AWS. Never more than one email per 24 hours.",

  trigger: { type: "event", eventName: "user.signup" },
  settings: { allowReentry: false },

  defaults: {
    from: "hello@updates.wraps.dev",
    fromName: "Wraps",
    replyTo: "support@wraps.dev",
  },

  steps: [
    // ── Immediate: what Wraps is and what the first command does ─────────
    sendEmail("welcome", { template: "welcome-series-welcome" }),

    // ── Day 1: the quickstart, unless they're already connected ──────────
    delay("wait-1d", { days: 1 }),
    condition("check-aws-1", {
      field: "contact.hasConnectedAws",
      operator: "is_true",
      branches: {
        yes: [exit("connected-early", { markAs: "completed" })],
        no: [
          sendEmail("quickstart", { template: "welcome-series-quickstart" }),
        ],
      },
    }),

    // ── Day 7: one last note, then stop ──────────────────────────────────
    delay("wait-6d", { days: 6 }),
    condition("check-aws-2", {
      field: "contact.hasConnectedAws",
      operator: "is_true",
      branches: {
        yes: [exit("connected-late", { markAs: "completed" })],
        no: [sendEmail("last-call", { template: "welcome-series-last-call" })],
      },
    }),

    exit("done", { markAs: "completed" }),
  ],
});
