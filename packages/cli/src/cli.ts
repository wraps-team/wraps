#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as clack from "@clack/prompts";
import pc from "picocolors";
// Auth commands
import { login as authLogin } from "./commands/auth/login.js";
import { logout as authLogout } from "./commands/auth/logout.js";
import { authStatus as authStatusCmd } from "./commands/auth/status.js";
// AWS commands
import { doctor as awsDoctor } from "./commands/aws/doctor.js";
import { setup as awsSetup } from "./commands/aws/setup.js";
// CDN commands
import { cdnDestroy } from "./commands/cdn/destroy.js";
import { init as cdnInit } from "./commands/cdn/init.js";
import { cdnStatus } from "./commands/cdn/status.js";
import { cdnSync } from "./commands/cdn/sync.js";
import { cdnUpgrade } from "./commands/cdn/upgrade.js";
import { cdnVerify } from "./commands/cdn/verify.js";
// Aggregate diagnostics
import { wrapsDoctor } from "./commands/doctor.js";
import { agentCreate, agentKill, agentList } from "./commands/email/agent.js";
import { check } from "./commands/email/check.js";
import { config } from "./commands/email/config.js";
import { connect } from "./commands/email/connect.js";
import { emailDestroy } from "./commands/email/destroy.js";
import { emailDoctor } from "./commands/email/doctor.js";
import {
  addDomain,
  configDomain,
  getDkim,
  listDomains,
  removeDomain,
  verifyDomain,
} from "./commands/email/domains.js";
import {
  inboundAdd,
  inboundDestroy,
  inboundInit,
  inboundRemove,
  inboundStatus,
  inboundTest,
  inboundVerify,
} from "./commands/email/inbound.js";
import { init } from "./commands/email/init.js";
import { emailLogsGet, emailLogsList } from "./commands/email/logs.js";
import { emailPlan } from "./commands/email/plan.js";
import {
  replyDecode,
  replyDestroy,
  replyInit,
  replyRotate,
  replyStatus,
} from "./commands/email/reply.js";
import { restore } from "./commands/email/restore.js";
import { emailStatus } from "./commands/email/status.js";
// Email commands
import { templatesInit } from "./commands/email/templates/init.js";
import { templatesPreview } from "./commands/email/templates/preview.js";
import { templatesPush } from "./commands/email/templates/push.js";
import { emailTest } from "./commands/email/test.js";
import { upgrade } from "./commands/email/upgrade.js";
import { workflowsInit } from "./commands/email/workflows/init.js";
import { workflowsPush } from "./commands/email/workflows/push.js";
import { workflowsValidate } from "./commands/email/workflows/validate.js";
// License commands
import { licenseGenerate } from "./commands/license/generate.js";
// Info commands
import { news } from "./commands/news.js";
import { permissions } from "./commands/permissions.js";
// Platform commands
import { connect as platformConnect } from "./commands/platform/connect.js";
import { disconnect as platformDisconnect } from "./commands/platform/disconnect.js";
import { platform as platformInfo } from "./commands/platform/index.js";
import { updateRole } from "./commands/platform/update-role.js";
// Self-hosted commands
import { selfhostEnv } from "./commands/selfhost/env.js";
import { selfhostLogin } from "./commands/selfhost/login.js";
import { selfhostLogout } from "./commands/selfhost/logout.js";
import { selfhostLogs } from "./commands/selfhost/logs.js";
import { selfhostStatus } from "./commands/selfhost/status.js";
// Shared commands
import { dashboard } from "./commands/shared/dashboard.js";
import { destroy } from "./commands/shared/destroy.js";
import { status } from "./commands/shared/status.js";
// SMS commands
import { smsDestroy } from "./commands/sms/destroy.js";
import { init as smsInit } from "./commands/sms/init.js";
import { smsRegister } from "./commands/sms/register.js";
import { smsStatus } from "./commands/sms/status.js";
import { smsSync } from "./commands/sms/sync.js";
import { smsTest } from "./commands/sms/test.js";
import { smsUpgrade } from "./commands/sms/upgrade.js";
import { smsVerifyNumber } from "./commands/sms/verify-number.js";
import { support } from "./commands/support.js";
// Telemetry commands
import {
  telemetryDisable,
  telemetryEnable,
  telemetryStatus,
} from "./commands/telemetry.js";
// Workflow commands
import { workflowInit } from "./commands/workflow/init.js";
import { getTelemetryClient } from "./telemetry/client.js";
import { telemetryCommandName } from "./telemetry/command-name.js";
import { trackCommand, trackCommandFallback } from "./telemetry/events.js";
import { parseCliArgs } from "./utils/shared/arg-parser.js";
import {
  printCompletionScript,
  setupTabCompletion,
} from "./utils/shared/completion.js";
import { suggestCommand } from "./utils/shared/did-you-mean.js";
import { errors, handleCLIError } from "./utils/shared/errors.js";
import { isJsonMode, setJsonMode } from "./utils/shared/json-output.js";

// Check Node.js version (requires 20+)
const [nodeMajorVersion] = process.versions.node.split(".").map(Number);
if (nodeMajorVersion < 20) {
  console.error(
    "\x1b[31mError: Wraps CLI requires Node.js 20 or higher.\x1b[0m"
  );
  console.error(`Current version: ${process.versions.node}`);
  console.error("");
  console.error("To upgrade Node.js:");
  console.error("  macOS/Linux (nvm): nvm install 20 && nvm use 20");
  console.error("  macOS (Homebrew):  brew install node@20");
  console.error("  Windows:           Download from https://nodejs.org/");
  console.error("");
  process.exit(1);
}

// Get package version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
);
const VERSION = packageJson.version;

// Setup tab completion
setupTabCompletion();

// Function to show version
function showVersion() {
  console.log(`wraps v${VERSION}`);
  process.exit(0);
}

// Function to show help
function showHelp() {
  clack.intro(pc.bold(`WRAPS CLI v${VERSION}`));
  console.log("Deploy AWS infrastructure to your account\n");
  console.log("Usage: wraps [service] <command> [options]\n");
  console.log("Services:");
  console.log(`  ${pc.cyan("email")}       Email infrastructure (AWS SES)`);
  console.log(
    `  ${pc.cyan("sms")}         SMS infrastructure (AWS End User Messaging)`
  );
  console.log(
    `  ${pc.cyan("cdn")}         CDN infrastructure (AWS S3 + CloudFront)`
  );
  console.log(
    `  ${pc.cyan("selfhost")}    Self-hosted Wraps control plane (enterprise)`
  );
  console.log(
    `  ${pc.cyan("license")}     License key management (Wraps team only)\n`
  );
  console.log("Email Commands:");
  console.log(
    `  ${pc.cyan("email init")}           Deploy new email infrastructure`
  );
  console.log(
    `  ${pc.cyan("email check")}          Check email deliverability for a domain`
  );
  console.log(
    `  ${pc.cyan("email connect")}        Connect to existing AWS SES`
  );
  console.log(
    `  ${pc.cyan("email status")}         Show email infrastructure details`
  );
  console.log(
    `  ${pc.cyan("email plan")}           Show SES pricing plan and cheaper options`
  );
  console.log(`  ${pc.cyan("email test")}           Send a test email`);
  console.log(`  ${pc.cyan("email verify")}         Verify domain DNS records`);
  console.log(
    `  ${pc.cyan("email sync")}           Apply CLI updates to infrastructure`
  );
  console.log(`  ${pc.cyan("email upgrade")}        Add features`);
  console.log(
    `  ${pc.cyan("email restore")}        Restore original configuration`
  );
  console.log(
    `  ${pc.cyan("email destroy")}        Remove email infrastructure`
  );
  console.log(
    `  ${pc.cyan("email doctor")}         Diagnose and clean up email infrastructure`
  );
  console.log(`  ${pc.cyan("email domains add")}    Add a domain to SES`);
  console.log(`  ${pc.cyan("email domains list")}   List all domains`);
  console.log(`  ${pc.cyan("email domains remove")} Remove a domain`);
  console.log(
    `  ${pc.cyan("email inbound init")}   Enable inbound email receiving`
  );
  console.log(`  ${pc.cyan("email inbound status")} Show inbound email status`);
  console.log(
    `  ${pc.cyan("email inbound verify")} Verify inbound DNS records`
  );
  console.log(
    `  ${pc.cyan("email inbound test")}   Send test email and verify receipt`
  );
  console.log(
    `  ${pc.cyan("email inbound destroy")} Remove inbound email infrastructure\n`
  );
  console.log("Agent Commands:");
  console.log(
    `  ${pc.cyan("email agent create")}   Create a leashed agent mailbox`
  );
  console.log(`  ${pc.cyan("email agent list")}     List agents`);
  console.log(
    `  ${pc.cyan("email agent kill")}     Kill an agent (revoke sending)\n`
  );
  console.log("Template Commands:");
  console.log(
    `  ${pc.cyan("email templates init")}  Initialize templates-as-code`
  );
  console.log(
    `  ${pc.cyan("email templates push")}  Push templates to SES + dashboard`
  );
  console.log(
    `  ${pc.cyan("email templates preview")} Preview templates in browser`
  );
  console.log(
    `  ${pc.cyan("push")}                  ${pc.dim("(alias for email templates push)")}\n`
  );
  console.log("Workflow Commands:");
  console.log(
    `  ${pc.cyan("email workflows init")}      Initialize workflows-as-code`
  );
  console.log(
    `  ${pc.cyan("email workflows validate")}  Validate workflow files`
  );
  console.log(
    `  ${pc.cyan("email workflows push")}      Push workflows to dashboard\n`
  );
  console.log("SMS Commands:");
  console.log(`  ${pc.cyan("sms init")}             Deploy SMS infrastructure`);
  console.log(
    `  ${pc.cyan("sms status")}           Show SMS infrastructure details`
  );
  console.log(`  ${pc.cyan("sms test")}             Send a test SMS message`);
  console.log(
    `  ${pc.cyan("sms verify-number")}    Verify a destination phone number`
  );
  console.log(
    `  ${pc.cyan("sms sync")}             Sync infrastructure (update Lambda, etc.)`
  );
  console.log(`  ${pc.cyan("sms upgrade")}          Upgrade SMS features`);
  console.log(`  ${pc.cyan("sms register")}         Register toll-free number`);
  console.log(
    `  ${pc.cyan("sms destroy")}          Remove SMS infrastructure\n`
  );
  console.log("CDN Commands:");
  console.log(
    `  ${pc.cyan("cdn init")}             Deploy CDN infrastructure (S3 + CloudFront)`
  );
  console.log(
    `  ${pc.cyan("cdn status")}           Show CDN infrastructure details`
  );
  console.log(
    `  ${pc.cyan("cdn verify")}           Check DNS and certificate status`
  );
  console.log(
    `  ${pc.cyan("cdn upgrade")}          Add custom domain after cert validation`
  );
  console.log(
    `  ${pc.cyan("cdn sync")}             Sync infrastructure with current config`
  );
  console.log(
    `  ${pc.cyan("cdn destroy")}          Remove CDN infrastructure\n`
  );
  console.log("Self-Hosted Commands:");
  console.log(
    `  ${pc.cyan("selfhost login")}       Sign in to your self-hosted Wraps instance`
  );
  console.log(
    `  ${pc.cyan("selfhost logout")}      Sign out of your self-hosted Wraps instance`
  );
  console.log(
    `  ${pc.cyan("selfhost status")}      Show self-hosted deployment details`
  );
  console.log(
    `  ${pc.cyan("selfhost logs")}        Stream logs from your self-hosted API, dashboard, and workers`
  );
  console.log(
    `  ${pc.cyan("selfhost env")}         Print env vars for hosting the dashboard yourself`
  );
  console.log(
    `  ${pc.cyan("selfhost connect")}     Connect your AWS account to your self-hosted instance`
  );
  console.log(
    `  ${pc.cyan("selfhost update-role")} Refresh your self-hosted console role's permissions\n`
  );
  console.log("Local Development:");
  console.log(
    `  ${pc.cyan("console")}               Start local web console\n`
  );
  console.log("Platform:");
  console.log(
    `  ${pc.cyan("platform")}              Show platform info and pricing`
  );
  console.log(
    `  ${pc.cyan("platform connect")}      Connect to Wraps Platform (events + IAM)`
  );
  console.log(
    `  ${pc.cyan("platform disconnect")}   Stop streaming events to Wraps Platform`
  );
  console.log(
    `  ${pc.cyan("platform update-role")} Update platform IAM permissions\n`
  );
  console.log("Auth:");
  console.log(
    `  ${pc.cyan("auth login")}           Sign in to wraps.dev (device flow)`
  );
  console.log(`  ${pc.cyan("auth status")}          Show current auth state`);
  console.log(
    `  ${pc.cyan("auth logout")}          Sign out and remove stored token\n`
  );
  console.log("AWS Setup:");
  console.log(
    `  ${pc.cyan("aws setup")}            Interactive AWS setup wizard`
  );
  console.log(
    `  ${pc.cyan("aws doctor")}           Diagnose AWS configuration issues\n`
  );
  console.log("Global Commands:");
  console.log(`  ${pc.cyan("status")}       Show overview of all services`);
  console.log(
    `  ${pc.cyan("doctor")}       Diagnose AWS + email infrastructure`
  );
  console.log(`  ${pc.cyan("destroy")}      Remove deployed infrastructure`);
  console.log(`  ${pc.cyan("permissions")} Show required AWS IAM permissions`);
  console.log(`  ${pc.cyan("completion")}   Generate shell completion script`);
  console.log(
    `  ${pc.cyan("telemetry")}    Manage anonymous telemetry settings`
  );
  console.log(`  ${pc.cyan("update")}       Update CLI to latest version`);
  console.log(`  ${pc.cyan("news")}         Show recent Wraps updates`);
  console.log(
    `  ${pc.cyan("support")}      Get help and support contact info\n`
  );
  console.log("Options:");
  console.log(
    `  ${pc.dim("-p, --provider")}  Hosting provider (vercel, aws, railway, other)`
  );
  console.log(`  ${pc.dim("-r, --region")}    AWS region`);
  console.log(`  ${pc.dim("-d, --domain")}    Domain name`);
  console.log(`  ${pc.dim("--account")}        AWS account ID or alias`);
  console.log(`  ${pc.dim("--preset")}         Configuration preset`);
  console.log(`  ${pc.dim("--token")}          API key or token for auth`);
  console.log(`  ${pc.dim("-y, --yes")}        Skip confirmation prompts`);
  console.log(`  ${pc.dim("-f, --force")}      Force destructive operations`);
  console.log(
    `  ${pc.dim("--preview")}        Preview changes without deploying`
  );
  console.log(`  ${pc.dim("-v, --version")}    Show version number\n`);
  console.log(
    `Run ${pc.cyan("wraps <service> <command> --help")} for more information.`
  );
  console.log(
    `AI agents: complete docs at ${pc.cyan("https://wraps.dev/llms-full.txt")}\n`
  );
}

// Check for version before the parser runs
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  showVersion();
}

// Check for help before the parser runs (custom help output beats any
// parser-generated one)
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showHelp();
  process.exit(0);
}

// Parse command and flags with the mri-backed parser. This fixes
// wraps-team/wraps#100: boolean flags no longer swallow the next positional.
//
// `flags` is intentionally typed loosely here to match the legacy `args` v5
// return shape — command handlers (Provider, Preset, scenario unions) remain
// the narrowing boundary. Strictly-typed access is available via CliFlags in
// src/utils/shared/arg-parser.ts.
const parsedCli = parseCliArgs(process.argv);
// biome-ignore lint/suspicious/noExplicitAny: legacy-compat loose shape — see note above
const flags: Record<string, any> = parsedCli.flags;
const { sub } = parsedCli;
const [primaryCommand, subCommand] = sub;

// Enable JSON output mode globally when --json flag is passed
setJsonMode(flags.json === true);

// If no command provided, show interactive menu
if (!primaryCommand) {
  async function interactiveMenu() {
    const startTime = Date.now();
    const telemetry = getTelemetryClient();

    // Show first-run telemetry notification
    if (!isJsonMode() && telemetry.shouldShowNotification()) {
      console.log();
      clack.log.info(pc.bold("Anonymous Telemetry"));
      console.log(
        `  Wraps collects ${pc.cyan("anonymous usage data")} to improve the CLI.`
      );
      console.log(
        `  We ${pc.bold("never")} collect: domains, AWS credentials, email content, or PII.`
      );
      console.log(
        `  We ${pc.bold("only")} collect: command names, success/failure, CLI version, OS.`
      );
      console.log();
      console.log(`  Opt-out anytime: ${pc.cyan("wraps telemetry disable")}`);
      console.log(`  Or set: ${pc.cyan("WRAPS_TELEMETRY_DISABLED=1")}`);
      console.log(`  Learn more: ${pc.cyan("https://wraps.dev/docs")}`);
      console.log();

      telemetry.markNotificationShown();
    }

    trackCommand("interactive:menu", { success: true, duration_ms: 0 });

    clack.intro(pc.bold(`WRAPS CLI v${VERSION}`));
    console.log("  Deploy AWS infrastructure to your account.\n");

    const action = await clack.select({
      message: "What would you like to do?",
      options: [
        {
          value: "email-init",
          label: "Deploy Email",
          hint: "AWS SES with tracking & analytics",
        },
        {
          value: "sms-init",
          label: "Deploy SMS",
          hint: "AWS End User Messaging",
        },
        {
          value: "cdn-init",
          label: "Deploy CDN",
          hint: "AWS S3 + CloudFront CDN",
        },
        {
          value: "status",
          label: "View Status",
          hint: "Check deployed infrastructure",
        },
        {
          value: "console",
          label: "Local Console",
          hint: "Start web dashboard locally",
        },
        {
          value: "platform",
          label: "Wraps Platform",
          hint: "Templates, broadcasts, automations",
        },
        {
          value: "news",
          label: "What's New",
          hint: "Recent updates & changelog",
        },
        {
          value: "support",
          label: "Get Help",
          hint: "Contact & documentation",
        },
        {
          value: "help",
          label: "All Commands",
          hint: "Show CLI reference",
        },
      ],
    });

    if (clack.isCancel(action)) {
      trackCommand("interactive:cancel", {
        success: true,
        duration_ms: Date.now() - startTime,
      });
      await telemetry.shutdown();
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    trackCommand(`interactive:${action}`, {
      success: true,
      duration_ms: Date.now() - startTime,
    });

    try {
      switch (action) {
        case "email-init":
          await init({
            provider: flags.provider,
            region: flags.region,
            domain: flags.domain,
            preset: flags.preset,
            yes: flags.yes,
            preview: flags.preview,
          });
          break;
        case "sms-init":
          await smsInit({
            provider: flags.provider,
            region: flags.region,
            preset: flags.preset,
            yes: flags.yes,
            preview: flags.preview,
          });
          break;
        case "cdn-init":
          await cdnInit({
            provider: flags.provider,
            region: flags.region,
            preset: flags.preset,
            yes: flags.yes,
            preview: flags.preview,
          });
          break;
        case "status":
          await status({ account: flags.account, region: flags.region });
          break;
        case "console":
          await dashboard({ port: flags.port, noOpen: flags.noOpen });
          break;
        case "platform":
          await platformInfo();
          break;
        case "news":
          await news();
          break;
        case "support":
          await support();
          break;
        case "help":
          showHelp();
          break;
      }

      trackCommand(`interactive:${action}:completed`, {
        success: true,
        duration_ms: Date.now() - startTime,
      });
    } catch (error) {
      trackCommand(`interactive:${action}:completed`, {
        success: false,
        duration_ms: Date.now() - startTime,
      });
      throw error;
    } finally {
      await telemetry.shutdown();
    }
  }

  // Run interactive menu and exit when done
  interactiveMenu()
    .then(() => process.exit(0))
    .catch(async (err) => {
      handleCLIError(err);
      // handleCLIError now sets process.exitCode and returns instead of
      // exiting, so run()'s `finally { await telemetry.shutdown() }` can flush
      // the error event. This path has no such finally left to run —
      // interactiveMenu's own finally already shut telemetry down before this
      // rejection arrived — so drain again here or the event dies with the
      // process.exit below.
      await getTelemetryClient().shutdown();
      process.exit(1);
    });
}

// Route to appropriate command (only runs if primaryCommand exists)
async function run() {
  const startTime = Date.now();
  const telemetry = getTelemetryClient();

  // Show first-run telemetry notification
  if (!isJsonMode() && telemetry.shouldShowNotification()) {
    console.log();
    clack.log.info(pc.bold("Anonymous Telemetry"));
    console.log(
      `  Wraps collects ${pc.cyan("anonymous usage data")} to improve the CLI.`
    );
    console.log(
      `  We ${pc.bold("never")} collect: domains, AWS credentials, email content, or PII.`
    );
    console.log(
      `  We ${pc.bold("only")} collect: command names, success/failure, CLI version, OS.`
    );
    console.log();
    console.log(`  Opt-out anytime: ${pc.cyan("wraps telemetry disable")}`);
    console.log(`  Or set: ${pc.cyan("WRAPS_TELEMETRY_DISABLED=1")}`);
    console.log(`  Learn more: ${pc.cyan("https://wraps.dev/docs")}`);
    console.log();

    telemetry.markNotificationShown();
  }

  try {
    // Handle service-specific subcommands (e.g., wraps email init)
    if (primaryCommand === "email" && subCommand) {
      switch (subCommand) {
        case "init":
          await init({
            provider: flags.provider,
            region: flags.region,
            domain: flags.domain,
            preset: flags.preset,
            yes: flags.yes,
            preview: flags.preview,
            quick: flags.quick,
            json: flags.json,
            force: flags.force,
          });
          break;

        case "test":
          await emailTest({
            region: flags.region,
            to: flags.to,
            scenario: flags.scenario,
            json: flags.json,
          });
          break;

        case "check":
          // Domain can be positional arg or --domain flag
          await check({
            domain: sub[2] || flags.domain,
            quick: flags.quick,
            json: flags.json,
            verbose: flags.verbose,
            dkimSelector: flags.dkimSelector,
            skipBlacklists: flags.skipBlacklists,
            skipTls: flags.skipTls,
            timeout: flags.timeout,
          });
          break;

        case "connect":
          await connect({
            provider: flags.provider,
            region: flags.region,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "config":
        case "sync":
          await config({
            region: flags.region,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "upgrade":
          await upgrade({
            region: flags.region,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
            action: flags.action,
            preset: flags.preset,
          });
          break;

        case "restore":
          await restore({
            region: flags.region,
            force: flags.force,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "status":
          await emailStatus({
            account: flags.account,
            region: flags.region,
            json: flags.json,
          });
          break;

        case "plan":
          await emailPlan({
            account: flags.account,
            region: flags.region,
            set: flags.set,
            volume: flags.volume,
            yes: flags.yes,
            json: flags.json,
          });
          break;

        case "verify": {
          if (!flags.domain) {
            throw errors.missingInput(
              "--domain",
              "wraps email verify --domain yourapp.com"
            );
          }
          await verifyDomain({
            domain: flags.domain,
            wait: flags.wait,
            interval: flags.interval
              ? Number.parseInt(flags.interval, 10)
              : undefined,
          });
          break;
        }

        case "inbound": {
          // Handle inbound subcommands
          const inboundSubCommand = sub[2];

          switch (inboundSubCommand) {
            case "init":
              await inboundInit({
                region: flags.region,
                subdomain: flags.domain, // reuse --domain flag for subdomain
                root: flags.root,
                yes: flags.yes,
                preview: flags.preview,
                json: flags.json,
              });
              break;

            case "destroy":
              await inboundDestroy({
                region: flags.region,
                force: flags.force,
                preview: flags.preview,
                json: flags.json,
              });
              break;

            case "status":
              await inboundStatus({
                region: flags.region,
                json: flags.json,
                revealSecret: flags.revealSecret,
              });
              break;

            case "verify":
              await inboundVerify({
                region: flags.region,
                json: flags.json,
              });
              break;

            case "test":
              await inboundTest({
                region: flags.region,
                json: flags.json,
              });
              break;

            case "add":
              await inboundAdd({
                region: flags.region,
                subdomain: flags.subdomain,
                root: flags.root,
                domain: flags.domain,
                yes: flags.yes,
                json: flags.json,
              });
              break;

            case "remove":
              await inboundRemove({
                region: flags.region,
                domain: flags.domain,
                yes: flags.yes,
                json: flags.json,
              });
              break;

            default:
              throw errors.unknownCommand(
                "inbound command",
                inboundSubCommand,
                "Available commands: init, destroy, status, verify, test, add, remove"
              );
          }
          break;
        }

        case "agent": {
          // Handle agent subcommands (wraps email agent <create|list|kill>)
          const agentSubCommand = sub[2];

          switch (agentSubCommand) {
            case "create":
              await agentCreate({
                region: flags.region,
                name: sub[3] || flags.name,
                domain: flags.domain,
                token: flags.token,
                yes: flags.yes,
                json: flags.json,
              });
              break;

            case "list":
              await agentList({
                token: flags.token,
                json: flags.json,
              });
              break;

            case "kill":
              await agentKill({
                name: sub[3] || flags.name,
                token: flags.token,
                yes: flags.yes,
                json: flags.json,
              });
              break;

            default:
              throw errors.unknownCommand(
                "agent command",
                agentSubCommand,
                "Available commands: create, list, kill"
              );
          }
          break;
        }

        case "reply": {
          const replySubCommand = sub[2];

          switch (replySubCommand) {
            case "init":
              await replyInit({
                region: flags.region,
                domain: flags.domain,
                all: flags.all,
                yes: flags.yes,
                preview: flags.preview,
                json: flags.json,
              });
              break;

            case "rotate":
              await replyRotate({
                region: flags.region,
                domain: flags.domain,
                yes: flags.yes,
                json: flags.json,
              });
              break;

            case "status":
              await replyStatus({
                region: flags.region,
                json: flags.json,
              });
              break;

            case "destroy":
              await replyDestroy({
                region: flags.region,
                domain: flags.domain,
                all: flags.all,
                force: flags.force,
                preview: flags.preview,
                json: flags.json,
              });
              break;

            case "decode": {
              const addressArg = sub[3];
              await replyDecode(addressArg, { json: flags.json });
              break;
            }

            default:
              throw errors.unknownCommand(
                "reply command",
                replySubCommand,
                "Available commands: init, rotate, status, destroy, decode"
              );
          }
          break;
        }

        case "domains": {
          // Handle domains subcommands
          const domainsSubCommand = sub[2];

          switch (domainsSubCommand) {
            case "add": {
              await addDomain({
                domain: flags.domain,
                region: flags.region,
                yes: flags.yes,
                trackingDomain: flags.trackingDomain,
                trackingHttps: flags.trackingHttps,
              });
              break;
            }

            case "list":
              await listDomains();
              break;

            case "verify": {
              if (!flags.domain) {
                throw errors.missingInput(
                  "--domain",
                  "wraps email domains verify --domain yourapp.com"
                );
              }
              await verifyDomain({ domain: flags.domain });
              break;
            }

            case "get-dkim": {
              if (!flags.domain) {
                throw errors.missingInput(
                  "--domain",
                  "wraps email domains get-dkim --domain yourapp.com"
                );
              }
              await getDkim({ domain: flags.domain });
              break;
            }

            case "remove": {
              if (!flags.domain) {
                throw errors.missingInput(
                  "--domain",
                  "wraps email domains remove --domain yourapp.com --force"
                );
              }
              await removeDomain({
                domain: flags.domain,
                force: flags.force,
              });
              break;
            }

            case "config": {
              await configDomain({
                domain: flags.domain,
                opens: flags.opens,
                clicks: flags.clicks,
                trackingDomain: flags.trackingDomain,
                trackingHttps: flags.trackingHttps,
                tlsRequired: flags.tlsRequired,
                reputationMetrics: flags.reputationMetrics,
                suppressBounce: flags.suppressBounce,
                suppressComplaint: flags.suppressComplaint,
                archive: flags.archive,
                sendingEnabled: flags.sendingEnabled,
                vdmEngagement: flags.vdmEngagement,
                vdmInbox: flags.vdmInbox,
                region: flags.region,
                json: flags.json,
              });
              break;
            }

            default:
              throw errors.unknownCommand(
                "domains command",
                domainsSubCommand,
                "Available commands: add, list, verify, get-dkim, remove, config"
              );
          }
          break;
        }

        case "templates": {
          const templatesSubCommand = sub[2];

          switch (templatesSubCommand) {
            case "init":
              await templatesInit({
                org: flags.org,
                noExample: flags.noExample,
                noClaude: flags.noClaude,
                yes: flags.yes,
                force: flags.force,
                json: flags.json,
              });
              break;

            case "push":
              await templatesPush({
                // Positional slug (e.g. `wraps email templates push my-slug`)
                // falls back to --template for a nicer UX.
                template: sub[3] || flags.template,
                dryRun: flags.dryRun,
                force: flags.force,
                yes: flags.yes,
                json: flags.json,
                token: flags.token,
              });
              break;

            case "preview":
              await templatesPreview({
                port: flags.port,
                template: flags.template,
                noOpen: flags.noOpen,
              });
              break;

            default:
              throw errors.unknownCommand(
                "templates command",
                templatesSubCommand,
                "Available commands: init, push, preview"
              );
          }
          break;
        }

        case "workflows": {
          const workflowsSubCommand = sub[2];

          switch (workflowsSubCommand) {
            case "init":
              await workflowsInit({
                noExample: flags.noExample,
                noClaude: flags.noClaude,
                force: flags.force,
                yes: flags.yes,
                json: flags.json,
              });
              break;

            case "validate":
              await workflowsValidate({
                workflow: flags.workflow,
                json: flags.json,
              });
              break;

            case "push":
              await workflowsPush({
                workflow: flags.workflow,
                dryRun: flags.dryRun,
                draft: flags.draft,
                force: flags.force,
                yes: flags.yes,
                json: flags.json,
                token: flags.token,
              });
              break;

            default:
              throw errors.unknownCommand(
                "workflows command",
                workflowsSubCommand,
                "Available commands: init, validate, push"
              );
          }
          break;
        }

        case "logs": {
          const logsSubCommand = sub[2];

          switch (logsSubCommand) {
            case "list":
              await emailLogsList({
                status: flags.status,
                limit: flags.limit,
                cursor: flags.cursor,
                json: flags.json,
                token: flags.token,
                region: flags.region,
              });
              break;

            case "get": {
              const messageId = sub[3];
              if (!messageId) {
                throw errors.missingInput(
                  "<message-id>",
                  "wraps email logs get <message-id>"
                );
              }
              await emailLogsGet({
                messageId,
                json: flags.json,
                token: flags.token,
                region: flags.region,
              });
              break;
            }

            default:
              throw errors.unknownCommand(
                "logs command",
                logsSubCommand,
                "Available commands: list, get <message-id>"
              );
          }
          break;
        }

        case "destroy":
          await emailDestroy({
            force: flags.force,
            region: flags.region,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "doctor":
          await emailDoctor({
            region: flags.region,
            json: flags.json,
            cleanup: flags.cleanup,
          });
          break;

        default:
          throw errors.unknownCommand(
            "email command",
            subCommand,
            "Run wraps --help for available commands."
          );
      }
      // Track email commands (they return early, so track here)
      const emailDuration = Date.now() - startTime;
      const emailCommandName = `email:${subCommand}`;
      trackCommandFallback(emailCommandName, {
        success: true,
        duration_ms: emailDuration,
        service: "email",
      });
      return;
    }

    // Handle license subcommands (e.g., wraps license generate)
    if (primaryCommand === "license" && subCommand) {
      switch (subCommand) {
        case "generate":
          await licenseGenerate({
            // baseline:allow-no-region
            tier: flags.tier,
            expires: flags.expires,
            json: flags.json,
          });
          break;

        default:
          throw errors.unknownCommand(
            "license command",
            subCommand,
            "Run wraps --help for available commands."
          );
      }
      trackCommandFallback(`license:${subCommand}`, {
        success: true,
        duration_ms: Date.now() - startTime,
        service: "license",
      });
      return;
    }

    // Handle selfhost subcommands (e.g., wraps selfhost deploy)
    if (primaryCommand === "selfhost" && subCommand) {
      switch (subCommand) {
        case "status":
          await selfhostStatus({
            region: flags.region,
            json: flags.json,
          });
          break;

        case "env":
          await selfhostEnv({
            region: flags.region,
            json: flags.json,
          });
          break;

        case "logs":
          await selfhostLogs({
            region: flags.region,
            follow: flags.follow,
            errors: flags.errors,
            source: flags.source,
            since: flags.since,
            filter: flags.filter,
            interval: flags.interval,
            live: flags.live,
            platform: flags.platform,
            verbose: flags.verbose,
            json: flags.json,
          });
          break;

        case "login":
          await selfhostLogin({
            region: flags.region,
            json: flags.json,
          });
          break;

        case "logout":
          await selfhostLogout({
            region: flags.region,
            json: flags.json,
          });
          break;

        case "connect":
          await platformConnect({
            region: flags.region,
            force: flags.force,
            yes: flags.yes,
            json: flags.json,
            selfhosted: true,
          });
          break;

        case "update-role":
          await updateRole({
            region: flags.region,
            force: flags.force,
            json: flags.json,
            selfhosted: true,
          });
          break;

        default:
          throw errors.unknownCommand(
            "selfhost command",
            subCommand,
            "Run wraps --help for available commands."
          );
      }
      // Track selfhost commands
      const selfhostDuration = Date.now() - startTime;
      const selfhostCommandName = `selfhost:${subCommand}`;
      trackCommandFallback(selfhostCommandName, {
        success: true,
        duration_ms: selfhostDuration,
        service: "selfhost",
      });
      return;
    }

    // Handle SMS subcommands (e.g., wraps sms init)
    if (primaryCommand === "sms" && subCommand) {
      switch (subCommand) {
        case "init":
          await smsInit({
            provider: flags.provider,
            region: flags.region,
            preset: flags.preset,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
            quick: flags.quick,
            countries: flags.countries,
            volume: flags.volume,
          });
          break;

        case "status":
          await smsStatus({
            account: flags.account,
            region: flags.region,
            json: flags.json,
          });
          break;

        case "test":
          await smsTest({
            to: flags.to,
            message: flags.message,
            region: flags.region,
            json: flags.json,
          });
          break;

        case "upgrade":
          await smsUpgrade({
            region: flags.region,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "sync":
          await smsSync({
            region: flags.region,
            yes: flags.yes,
          });
          break;

        case "destroy":
          await smsDestroy({
            force: flags.force,
            preview: flags.preview,
            region: flags.region,
            json: flags.json,
          });
          break;

        case "verify-number":
          await smsVerifyNumber({
            phoneNumber: flags.phoneNumber,
            code: flags.code,
            list: flags.list,
            delete: flags.delete,
            resend: flags.resend,
            region: flags.region,
            json: flags.json,
          });
          break;

        case "register":
          await smsRegister({
            region: flags.region,
          });
          break;

        default:
          throw errors.unknownCommand(
            "sms command",
            subCommand,
            "Run wraps --help for available commands."
          );
      }
      // Track SMS commands
      const smsDuration = Date.now() - startTime;
      const smsCommandName = `sms:${subCommand}`;
      trackCommandFallback(smsCommandName, {
        success: true,
        duration_ms: smsDuration,
        service: "sms",
      });
      return;
    }

    // Handle CDN subcommands (e.g., wraps cdn init)
    if (primaryCommand === "cdn" && subCommand) {
      switch (subCommand) {
        case "init":
          await cdnInit({
            provider: flags.provider,
            region: flags.region,
            preset: flags.preset,
            domain: flags.domain,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "status":
          await cdnStatus({
            region: flags.region,
            json: flags.json,
          });
          break;

        case "verify":
          await cdnVerify({
            region: flags.region,
            json: flags.json,
          });
          break;

        case "upgrade":
          await cdnUpgrade({
            region: flags.region,
            yes: flags.yes,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        case "sync":
          await cdnSync({
            region: flags.region,
          });
          break;

        case "destroy":
          await cdnDestroy({
            force: flags.force,
            region: flags.region,
            preview: flags.preview,
            json: flags.json,
          });
          break;

        default:
          throw errors.unknownCommand(
            "cdn command",
            subCommand,
            "Run wraps --help for available commands."
          );
      }
      // Track CDN commands
      const cdnDuration = Date.now() - startTime;
      const cdnCommandName = `cdn:${subCommand}`;
      trackCommandFallback(cdnCommandName, {
        success: true,
        duration_ms: cdnDuration,
        service: "cdn",
      });
      return;
    }

    // Handle Workflow subcommands (e.g., wraps workflow init)
    if (primaryCommand === "workflow") {
      switch (subCommand) {
        case "init":
          await workflowInit({
            yes: flags.yes,
          });
          break;

        default:
          throw errors.unknownCommand(
            "workflow command",
            subCommand,
            "Available commands: init\n\nRun wraps --help for more information."
          );
      }
      // Track workflow commands
      const workflowDuration = Date.now() - startTime;
      const workflowCommandName = `workflow:${subCommand}`;
      trackCommandFallback(workflowCommandName, {
        success: true,
        duration_ms: workflowDuration,
        service: "workflow",
      });
      return;
    }

    // Handle Platform subcommands
    if (primaryCommand === "platform") {
      if (!subCommand) {
        // Show platform info when no subcommand
        await platformInfo();
        const platformDuration = Date.now() - startTime;
        trackCommandFallback("platform", {
          success: true,
          duration_ms: platformDuration,
        });
        return;
      }

      switch (subCommand) {
        case "connect":
          await platformConnect({
            region: flags.region,
            force: flags.force,
            yes: flags.yes,
            json: flags.json,
          });
          break;

        case "disconnect":
          await platformDisconnect({
            region: flags.region,
            force: flags.force,
            yes: flags.yes,
            json: flags.json,
          });
          break;

        case "update-role":
          await updateRole({
            region: flags.region,
            force: flags.force,
            json: flags.json,
          });
          break;

        default:
          throw errors.unknownCommand(
            "platform command",
            subCommand,
            "Available commands: connect, disconnect, update-role\n\nRun wraps platform for more information."
          );
      }
      // Track platform commands (they return early, so track here)
      const platformDuration = Date.now() - startTime;
      const platformCommandName = `platform:${subCommand}`;
      trackCommandFallback(platformCommandName, {
        success: true,
        duration_ms: platformDuration,
      });
      return;
    }

    // Handle Auth subcommands (e.g., wraps auth login)
    if (primaryCommand === "auth") {
      switch (subCommand) {
        case "login":
          await authLogin({ token: flags.token, json: flags.json });
          break;

        case "status":
          await authStatusCmd({ json: flags.json });
          break;

        case "logout":
          await authLogout();
          break;

        default:
          throw errors.unknownCommand(
            "auth command",
            subCommand,
            "Available commands: login, status, logout"
          );
      }
      return;
    }

    // Handle AWS subcommands (e.g., wraps aws setup)
    if (primaryCommand === "aws" && subCommand) {
      switch (subCommand) {
        case "setup":
          await awsSetup({});
          break;

        case "doctor":
          await awsDoctor({ region: flags.region, json: flags.json });
          break;

        default:
          throw errors.unknownCommand(
            "aws command",
            subCommand,
            "Available commands: setup, doctor\n\nRun wraps --help for more information."
          );
      }
      // Track aws commands
      const awsDuration = Date.now() - startTime;
      const awsCommandName = `aws:${subCommand}`;
      trackCommandFallback(awsCommandName, {
        success: true,
        duration_ms: awsDuration,
      });
      return;
    }

    // Handle global commands
    switch (primaryCommand) {
      // Convenience alias: wraps push → wraps email templates push
      case "push":
        await templatesPush({
          // `wraps push my-slug` is the same shortcut as above.
          template: sub[1] || flags.template,
          dryRun: flags.dryRun,
          force: flags.force,
          yes: flags.yes,
          json: flags.json,
          token: flags.token,
        });
        break;

      // Global commands (work across all services)
      case "status":
        await status({
          account: flags.account,
          region: flags.region,
          json: flags.json,
        });
        break;

      case "doctor":
        await wrapsDoctor({
          region: flags.region,
          json: flags.json,
        });
        break;

      case "console":
        await dashboard({
          port: flags.port,
          noOpen: flags.noOpen,
        });
        break;

      case "destroy":
        await destroy({
          force: flags.force,
          preview: flags.preview,
          region: flags.region,
          json: flags.json,
        });
        break;

      case "completion":
        printCompletionScript();
        break;

      case "update": {
        const { update } = await import("./commands/update.js");
        await update(VERSION);
        break;
      }

      case "news":
        await news();
        break;

      case "permissions":
        await permissions({
          json: flags.json,
          preset: flags.preset as
            | "starter"
            | "production"
            | "enterprise"
            | undefined,
          service: flags.service as "email" | "sms" | "cdn" | undefined,
        });
        break;

      case "support":
        await support();
        break;

      case "telemetry": {
        // Handle telemetry subcommands
        switch (subCommand) {
          case "enable":
            await telemetryEnable();
            break;

          case "disable":
            await telemetryDisable();
            break;

          case "status":
          case undefined:
            await telemetryStatus();
            break;

          default:
            throw errors.unknownCommand(
              "telemetry command",
              subCommand,
              "Available commands: enable, disable, status"
            );
        }
        break;
      }

      case "help":
        showHelp();
        break;

      // Show help for service without subcommand
      case "email":
      case "sms":
      case "cdn":
      case "aws":
      case "workflow":
        console.log(
          `\nPlease specify a command for ${primaryCommand} service.\n`
        );
        showHelp();
        break;

      default: {
        const didYouMean = suggestCommand(primaryCommand);
        const hint = didYouMean
          ? `Did you mean: wraps ${didYouMean}\n\nRun wraps --help for available commands.`
          : "Run wraps --help for available commands.";
        throw errors.unknownCommand("command", primaryCommand, hint);
      }
    }
    // Track successful command execution
    const duration = Date.now() - startTime;
    const commandName = telemetryCommandName(
      primaryCommand,
      subCommand,
      sub[2]
    );

    trackCommandFallback(commandName, {
      success: true,
      duration_ms: duration,
    });
  } catch (error) {
    // Track failed command execution
    const duration = Date.now() - startTime;
    const commandName = telemetryCommandName(
      primaryCommand,
      subCommand,
      sub[2]
    );

    trackCommandFallback(commandName, {
      success: false,
      duration_ms: duration,
    });

    // Pass the command name so agent commands (e.g. "email:agent") opt into the
    // agent-enforcement error mappings; other commands stay on generic AWS errors.
    handleCLIError(error, commandName);
  } finally {
    // Ensure telemetry events are sent before exit
    await telemetry.shutdown();
    // handleCLIError now sets process.exitCode and returns so this finally can
    // run. Exit explicitly once the drain is done: a command that threw with a
    // live clack spinner leaves an un-unref'd setInterval behind, and without
    // this the CLI would print the error and then hang instead of exiting 1.
    if (process.exitCode) {
      process.exit(process.exitCode as number);
    }
  }
}

// Only run main command router if a command was provided
// (interactive menu handles its own flow when no command)
if (primaryCommand) {
  run();
}
