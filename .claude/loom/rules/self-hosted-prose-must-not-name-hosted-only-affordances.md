---
name: self-hosted-prose-must-not-name-hosted-only-affordances
severity: serious
origin: cli-first-deploy-step — Self-hosted CLI panel tells the user to "use the browser path" — a card that is never rendered when self-hosted
applies-to: "apps/web/src/**/*.tsx"
---

## What

Copy that names a UI affordance by name ("use the browser path", "click Connect
below", "the Domains tab") must be gated on the same condition as the
affordance it names. If the card is behind `!selfHosted`, the sentence pointing
at it is too.

## Why

`apps/web/src/app/(onboarding)/[orgSlug]/onboarding/components/cli-deploy-connect-step.tsx:548`
(as of `aec69b90^`) opened the CLI panel with a hard-coded sentence:

```tsx
Needs Node.js and AWS credentials on this machine. No local
credentials? Use the browser path instead.
```

The Browser (CloudFormation) card is gated on `!selfHosted`. So a self-hosted
user who picked CLI, discovered they had no AWS credentials on that machine, and
followed the only guidance the page offered went looking for a card the page
does not render. Skip was then the only move — on the most-skipped step of the
onboarding flow. The existing self-hosted test asserted the *card* was absent
and never read the copy that named it, so the two halves of the gate drifted
apart silently.

Fixed in `aec69b90` by making the second half of the sentence conditional on
`selfHosted`, pointing at configuring credentials on the CLI machine plus
`wraps aws doctor` — the fallback the prerequisites hint already names.

## Not mechanized

No static rule can know that a string literal names a UI affordance, or which
conditional governs that affordance. Every expressible approximation — "prose
inside a `selfHosted` branch may not contain /browser/i", "a component with a
`selfHosted` prop may not contain unconditional text" — either encodes one
word from one incident or flags correct code. A wrong rule here would be worse
than none: it would train people to reword around a grep.

**The mechanized form is a test, and it landed.**
`apps/web/src/app/(onboarding)/[orgSlug]/onboarding/components/__tests__/cli-deploy-connect-step.test.tsx`
now renders with `selfHosted={true}`, clicks "Use the CLI", and asserts the
markup contains no `browser path` and does contain `wraps aws doctor`, with a
mirror unit for `selfHosted={false}`.

That pairing — **absent affordance + absent prose naming it, asserted together
in one unit** — is the pattern to repeat for every future `selfHosted` split.
When you add a card behind `!selfHosted`, the same unit that asserts the card is
missing must also sweep the rendered markup for the words that name it.
`renderedMarkup()` in that file exists for exactly this.

Reviewers: this class needs human eyes. When a diff gates a UI element on
`selfHosted` (or any plan/feature flag), read the surrounding copy for
sentences that point at it.
