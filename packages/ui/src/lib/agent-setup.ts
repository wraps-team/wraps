/**
 * Coding-agent setup prompt shared by dashboard onboarding (`apps/web`) and the
 * marketing site (`apps/website`). Plain TypeScript, no React, no secrets: the
 * prompt and the deep links built from it must never carry an organization ID,
 * a webhook secret or any credential. Only the organization's display name may
 * enter the onboarding variant, with whitespace collapsed.
 */

export const AGENT_SKILLS_INSTALL = "npx add-skill wraps-team/skills";

export type AgentSetupContext = "onboarding" | "website";

export type AgentSetupPromptOptions = {
  /** Organization display name. Only used by the onboarding variant. */
  orgName?: string;
  /** Switch the sign-in and connect commands to the self-hosted ones. Onboarding only. */
  selfHosted?: boolean;
  context: AgentSetupContext;
};

const ORG_NAME_MAX_LENGTH = 100;

/**
 * Make an organization name safe to quote inside the prompt: drop control and
 * format characters (zero-width, bidi overrides), collapse whitespace so the
 * name stays on one line, swap double quotes for single so the name cannot end
 * the quoted string early, and cap the length.
 */
function cleanOrgName(name?: string): string | undefined {
  const cleaned = name
    ?.replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/"/g, "'")
    .trim()
    .slice(0, ORG_NAME_MAX_LENGTH)
    .trim();
  return cleaned || undefined;
}

/**
 * Onboarding variant. Mirrors the CLI path (every command is one of the CLI
 * steps) but calls out the interactive points an agent would otherwise stall
 * on: device code, region/preset prompts, org selection.
 */
function buildOnboardingPrompt(orgName?: string, selfHosted = false): string {
  const name = cleanOrgName(orgName);
  const orgLine = name
    ? `   If it asks which organization to connect, choose "${name}".`
    : "   If it asks which organization to connect, ask me which one to pick.";

  return `Deploy Wraps email infrastructure into my AWS account and connect it to my Wraps dashboard.

1. Check my AWS credentials: aws sts get-caller-identity
   If that fails, help me set up credentials before continuing — AWS SSO, access keys, environment variables, and AWS_PROFILE all work.
2. Install the CLI: npm install -g @wraps.dev/cli
   (or: curl -fsSL https://get.wraps.dev | sh)
3. Sign in: ${selfHosted ? "wraps selfhost login" : "wraps auth login"}
   This is a device-code flow — it prints a code like XXXX-XXXX and tries to open a browser. Show me the code and wait for me to confirm I approved it before moving on.
4. Deploy the infrastructure: wraps email init
   It prompts for an AWS region and a preset (starter / production / enterprise), then shows estimated monthly AWS cost. Show me those and let me choose — don't accept the deploy on my behalf.
5. Connect the deployment to my dashboard: ${selfHosted ? "wraps selfhost connect" : "wraps platform connect"}
${orgLine}
6. Confirm it worked: wraps email status --json
   Report the region, the SES configuration set, and whether the account is still in the SES sandbox (sandbox means I can only send to verified addresses until AWS grants production access).

When you're done, tell me — I'll click "I've finished — check connection" in the Wraps onboarding tab.

Full Wraps docs (agent-readable): https://wraps.dev/llms-full.txt`;
}

/**
 * Website variant: its own text, kept under 1,000 characters so Claude Code's
 * deep-link handler does not show its long-prompt warning. Visitors are new and
 * have one organization, so there is no org line.
 */
const WEBSITE_PROMPT = [
  "Set up Wraps email for me. Wraps deploys Amazon SES into my own AWS account and connects it to the Wraps dashboard.",
  "",
  "1. Check my AWS access: aws sts get-caller-identity",
  "   If that fails, help me set up credentials first. AWS SSO, access keys and AWS_PROFILE all work.",
  "2. Install the Wraps CLI: npm install -g @wraps.dev/cli",
  "3. Sign in: wraps auth login",
  "   It prints a code like XXXX-XXXX and opens a browser. Show me the code and wait until I say I've approved it.",
  "4. Deploy: wraps email init",
  "   It asks for an AWS region and a preset and shows the estimated monthly AWS cost. Show me the choices and let me pick. Don't accept the deploy for me.",
  "5. Connect it to my dashboard: wraps platform connect",
  "6. Check it worked: wraps email status --json",
  "   Tell me the region and whether the account is still in the SES sandbox.",
  "",
  "Then tell me what's left: add my sending domain and request production access, both from the Wraps dashboard.",
  "",
  "Wraps docs for agents: https://wraps.dev/llms-full.txt",
].join("\n");

export function buildAgentSetupPrompt(opts: AgentSetupPromptOptions): string {
  if (opts.context === "website") {
    return WEBSITE_PROMPT;
  }
  return buildOnboardingPrompt(opts.orgName, opts.selfHosted ?? false);
}

export type AgentDeepLinks = {
  /** Claude Code in a terminal. Max 5,000 characters; warns above 1,000. */
  claudeCode: string;
  /** Claude Code inside the Claude desktop app. */
  claudeApp: string;
  /** Cursor agent chat, native scheme (the prompt never leaves the machine). */
  cursor: string;
};

export function agentDeepLinks(prompt: string): AgentDeepLinks {
  const q = encodeURIComponent(prompt);
  return {
    claudeCode: `claude-cli://open?q=${q}`,
    claudeApp: `claude://code/new?q=${q}`,
    cursor: `cursor://anysphere.cursor-deeplink/prompt?text=${q}`,
  };
}
