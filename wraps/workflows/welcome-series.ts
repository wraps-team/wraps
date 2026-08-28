import {
  condition,
  defineWorkflow,
  delay,
  exit,
  sendEmail,
  subscribeTopic,
  waitForEmailEngagement,
} from "@wraps.dev/client";

/**
 * New Welcome Series
 *
 * Replaces the dashboard-built "Welcome Series" (a flat welcome → 4 day wait →
 * tips → exit). That version treated every signup the same, so the people who
 * were already reading got nagged and the people who never opened anything got
 * two emails and silence.
 *
 * This one splits on whether the quickstart actually got opened, and sends a
 * different sequence to each side:
 *
 *   +0    → Welcome: what Wraps is, the one command, the honest caveats
 *   +2h   → Quickstart: three commands to a verified domain and a first send
 *   +2h   → Watch the quickstart for an open (2 day window)
 *
 *   engaged (opened) — shorter gaps, deeper material:
 *     Day 1 → Tips: the four things people find three months late
 *     Day 3 → AWS setup: getting out of the SES sandbox
 *     Day 6 → Subscribe to Wraps Product Updates, then confirm what that means
 *
 *   not engaged (timeout) — longer gaps, one blocker at a time:
 *     +0    → Reactivate: name the three things that usually stall setup
 *     Day 4 → Mobile rescue: you can't run a CLI from a phone
 *     Day 10 → Last call: the honest anti-pitch, then stop
 *
 * Engagement branching works by pairing `waitForEmailEngagement` with a
 * `condition` on `engagement.status` — the wait step records its branch
 * ("opened"/"clicked"/"timeout") and the condition reads it back. Branches
 * only transform for `condition` steps, so hanging them off the wait step
 * directly would drop them silently.
 *
 * NOTE: the live "Welcome Series" also triggers on `user.signup`. Pause it
 * before enabling this one, or every signup gets both.
 */

/** "Wraps Product Updates" — the topic step takes the id, not the slug. */
const PRODUCT_UPDATES_TOPIC = "9b70bbaf-19ce-4758-8b19-f1c84f11d78e";

export default defineWorkflow({
  // Named for the draft this replaces, and to stay distinguishable from the
  // still-live "Welcome Series" in the dashboard — enabling the wrong one of
  // two identically named workflows would double-mail every signup.
  name: "New Welcome Series",
  description:
    "Welcome and quickstart for every signup, then an engagement split: deeper material for people who opened, one blocker at a time for people who didn't.",

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

    // ── +2h: the quickstart, while the signup is still fresh ─────────────
    delay("wait-2h", { hours: 2 }),
    sendEmail("quickstart", { template: "welcome-series-quickstart" }),

    // ── Behavioral split on the quickstart ───────────────────────────────
    waitForEmailEngagement("watch-quickstart", {
      emailStepId: "quickstart",
      engagementType: "opened",
      timeout: { days: 2 },
    }),

    condition("check-engaged", {
      field: "engagement.status",
      operator: "equals",
      value: "true",
      branches: {
        // ── Engaged: shorter gaps, more depth ────────────────────────────
        yes: [
          delay("engaged-wait-1d", { days: 1 }),
          sendEmail("tips", { template: "welcome-series-tips" }),

          delay("engaged-wait-2d", { days: 2 }),
          sendEmail("aws-setup", { template: "welcome-series-aws-setup" }),

          delay("engaged-wait-3d", { days: 3 }),
          subscribeTopic("subscribe-product-updates", {
            topicId: PRODUCT_UPDATES_TOPIC,
            channel: "email",
          }),
          sendEmail("product-updates", {
            template: "welcome-series-product-updates",
          }),

          exit("engaged-done", { markAs: "completed" }),
        ],

        // ── Not engaged: longer gaps, one blocker per email ──────────────
        no: [
          sendEmail("reactivate", { template: "welcome-series-reactivate" }),

          delay("cold-wait-4d", { days: 4 }),
          sendEmail("mobile-rescue", {
            template: "welcome-series-mobile-rescue",
          }),

          delay("cold-wait-6d", { days: 6 }),
          sendEmail("last-call", { template: "welcome-series-last-call" }),

          exit("cold-done", { markAs: "completed" }),
        ],
      },
    }),
  ],
});
