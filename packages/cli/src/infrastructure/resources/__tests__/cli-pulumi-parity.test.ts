import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_EVENT_TYPES, EMAIL_ROLE_NAME } from "@wraps/core";
import {
  buildDeliveryOptions as pulumiBuildDeliveryOptions,
  resolveMatchingEventTypes as pulumiResolveMatchingEventTypes,
} from "@wraps.dev/pulumi";
import { describe, expect, it } from "vitest";
import { deriveServiceRoleName } from "../../shared/iam.js";
import {
  buildDeliveryOptions as cliBuildDeliveryOptions,
  resolveMatchingEventTypes as cliResolveMatchingEventTypes,
} from "../ses.js";

/**
 * Plan 183: there are two Pulumi implementations of the email stack
 * (`packages/cli/src/infrastructure/` — what `email init` actually deploys —
 * and `packages/pulumi/`, the published library with no consumer in this
 * monorepo). They already diverged once (plan 182's fix: the CLI hardcoded
 * `matchingEventTypes` while the library honored a caller-supplied list) and
 * it happened before, in the opposite direction, for Mail Manager archiving
 * (plan 014). Shared literals (resource names, `ALL_EVENT_TYPES`, the
 * EventBridge pattern) now live in `@wraps/core` and both packages import
 * them, so those values cannot drift silently. This file guards the one
 * thing constants cannot express: the *derivation logic* — each package
 * still has its own `resolveMatchingEventTypes` function, and nothing stops
 * one of them from changing its branching behavior independently even
 * though both start from the same `ALL_EVENT_TYPES` constant.
 *
 * Deliberately unit-level: calls the exported pure functions directly,
 * constructs zero Pulumi resources, needs no AWS credentials or live stack.
 *
 * Runs under `pnpm --filter @wraps.dev/cli test` (this file lives in the
 * CLI package's own test suite; `packages/cli` added `@wraps.dev/pulumi` as
 * a devDependency specifically to make this comparison possible — the
 * cross-package import proved practical, so the plan's "read and parse the
 * other package's file instead" fallback was not needed here).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("resolveMatchingEventTypes: cli and pulumi agree on the default-set derivation", () => {
  const cases: { label: string; input: typeof ALL_EVENT_TYPES | undefined }[] =
    [
      { label: "undefined (unset)", input: undefined },
      { label: "empty array", input: [] },
      { label: "single-element subset", input: ["BOUNCE"] },
      {
        label: "multi-element subset",
        input: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
      },
      { label: "the full set, explicitly passed", input: [...ALL_EVENT_TYPES] },
    ];

  it.each(cases)("$label", ({ input }) => {
    expect(cliResolveMatchingEventTypes(input)).toEqual(
      pulumiResolveMatchingEventTypes(input)
    );
  });

  it("both default to ALL_EVENT_TYPES for undefined and empty array", () => {
    expect(cliResolveMatchingEventTypes(undefined)).toEqual(ALL_EVENT_TYPES);
    expect(pulumiResolveMatchingEventTypes(undefined)).toEqual(ALL_EVENT_TYPES);
    expect(cliResolveMatchingEventTypes([])).toEqual(ALL_EVENT_TYPES);
    expect(pulumiResolveMatchingEventTypes([])).toEqual(ALL_EVENT_TYPES);
  });
});

describe("buildDeliveryOptions: cli and pulumi agree", () => {
  const cases: {
    label: string;
    input: { tlsRequired?: boolean; sendingPoolName?: string };
  }[] = [
    { label: "neither set", input: {} },
    { label: "tlsRequired only", input: { tlsRequired: true } },
    {
      label: "sendingPoolName only",
      input: { sendingPoolName: "wraps-email-managed" },
    },
    {
      label: "both set",
      input: { tlsRequired: true, sendingPoolName: "wraps-email-managed" },
    },
  ];

  it.each(cases)("$label", ({ input }) => {
    expect(cliBuildDeliveryOptions(input)).toEqual(
      pulumiBuildDeliveryOptions(input)
    );
  });
});

describe("wraps-email-role name: cli's template agrees with pulumi's constant", () => {
  // pulumi/resources/iam.ts imports EMAIL_ROLE_NAME and uses it directly as
  // the literal role name. The CLI produces the same string by template
  // (`wraps-${serviceName}-role`, shared across email/sms/cdn in
  // createServiceIAMRole) rather than importing the constant, because
  // rewriting that shared templating for one caller is out of scope for a
  // behavior-preserving extraction. deriveServiceRoleName is the same
  // one-line derivation createServiceIAMRole calls internally — not a
  // reimplementation of it — so this proves the deploy path, not just that
  // the string "email" concatenates the way you'd expect.
  it("deriveServiceRoleName('email') equals EMAIL_ROLE_NAME", () => {
    expect(deriveServiceRoleName("email")).toBe(EMAIL_ROLE_NAME);
  });
});

describe("EventBridge rule pattern: cli and pulumi both reference the shared constant", () => {
  // Text-checked rather than called: the pattern is inlined into resource
  // constructor args in both packages (`new aws.cloudwatch.EventRule(...)`),
  // not returned by an exported function, and invoking those constructors
  // needs live Pulumi/AWS machinery — out of scope for a unit-level guard.
  // This instead guards that neither file quietly reverted to a hand-written
  // `{ source: ["aws.ses"] }` literal instead of importing SES_EVENT_PATTERN.
  const cliEventbridgeSource = readFileSync(
    join(__dirname, "../eventbridge.ts"),
    "utf-8"
  );
  const pulumiEventsSource = readFileSync(
    join(__dirname, "../../../../../pulumi/src/resources/events.ts"),
    "utf-8"
  );

  it("cli's EventBridge rule uses SES_EVENT_PATTERN", () => {
    expect(cliEventbridgeSource).toContain("SES_EVENT_PATTERN");
    expect(cliEventbridgeSource).toContain('from "@wraps/core"');
  });

  it("pulumi's EventBridge rule uses SES_EVENT_PATTERN", () => {
    expect(pulumiEventsSource).toContain("SES_EVENT_PATTERN");
    expect(pulumiEventsSource).toContain('from "@wraps/core"');
  });
});
