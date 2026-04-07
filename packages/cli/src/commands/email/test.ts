import {
  GetEmailIdentityCommand,
  SESv2Client,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { trackCommand, trackError } from "../../telemetry/events.js";
import type { EmailTestOptions } from "../../types/index.js";
import {
  isSimulatorAddress,
  SES_SIMULATOR_ADDRESSES,
  SIMULATOR_SCENARIOS,
} from "../../utils/email/ses-simulator.js";
import {
  pollDomainVerification,
  verifySandboxRecipient,
} from "../../utils/email/verification.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import { WrapsError } from "../../utils/shared/errors.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import {
  getAllTrackedDomains,
  loadConnectionMetadata,
} from "../../utils/shared/metadata.js";
import { DeploymentProgress } from "../../utils/shared/output.js";

/**
 * Email Test command - Send a test email via SES
 */
export async function emailTest(options: EmailTestOptions): Promise<void> {
  const startTime = Date.now();
  const progress = new DeploymentProgress();

  if (!isJsonMode()) {
    clack.intro(pc.bold("Wraps Email Test"));
  }

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = options.region || (await getAWSRegion());

  // 3. Check for existing metadata (email must be deployed)
  const metadata = await loadConnectionMetadata(identity.accountId, region);

  if (!metadata?.services?.email) {
    progress.stop();
    clack.log.error("No email infrastructure found");
    console.log(
      `\nRun ${pc.cyan("wraps email init")} to deploy email infrastructure.\n`
    );
    process.exit(1);
    return;
  }

  const trackedDomains = getAllTrackedDomains(metadata);

  if (trackedDomains.length === 0) {
    progress.stop();
    clack.log.error("No domain configured in email infrastructure");
    console.log(`\nRun ${pc.cyan("wraps email init")} to set up a domain.\n`);
    process.exit(1);
    return;
  }

  let domain: string;
  if (trackedDomains.length === 1) {
    domain = trackedDomains[0].domain;
  } else if (isJsonMode()) {
    const primaryTrackedDomain =
      trackedDomains.find((trackedDomain) => trackedDomain.isPrimary) ||
      trackedDomains[0];
    domain = primaryTrackedDomain.domain;
  } else {
    const selected = await clack.select({
      message: "Which domain do you want to send from?",
      options: trackedDomains.map((d) => ({
        value: d.domain,
        label: d.domain,
        hint: d.isPrimary ? "primary" : d.purpose,
      })),
    });

    if (clack.isCancel(selected)) {
      clack.cancel("Operation cancelled.");
      process.exit(0);
    }

    domain = selected as string;
  }

  // 4. Get recipient email
  let toEmail = options.to;

  if (!toEmail) {
    if (isJsonMode() && !options.scenario) {
      throw new WrapsError(
        "The --to or --scenario flag is required in JSON mode",
        "MISSING_REQUIRED_FLAG",
        "Provide --to <email> or --scenario <scenario>"
      );
    }

    // Check if a scenario was passed via flag
    if (options.scenario) {
      const scenarioKey =
        options.scenario.toUpperCase() as keyof typeof SES_SIMULATOR_ADDRESSES;
      toEmail = SES_SIMULATOR_ADDRESSES[scenarioKey];
      if (!toEmail) {
        progress.stop();
        clack.log.error(
          `Unknown scenario: ${options.scenario}. Valid: success, bounce, complaint, ooto, suppression_list`
        );
        process.exit(1);
        return;
      }
    } else {
      // Interactive prompt
      const destinationType = await clack.select({
        message: "Choose test destination:",
        options: [
          {
            value: "simulator",
            label: "Use SES simulator",
            hint: "Works in sandbox mode, doesn't affect reputation",
          },
          {
            value: "custom",
            label: "Enter email address",
            hint: "Must be verified if in sandbox mode",
          },
        ],
      });

      if (clack.isCancel(destinationType)) {
        clack.cancel("Operation cancelled.");
        process.exit(0);
      }

      if (destinationType === "simulator") {
        const scenario = await clack.select({
          message: "Select test scenario:",
          options: Object.entries(SIMULATOR_SCENARIOS).map(([key, info]) => ({
            value: key,
            label: info.name,
            hint: info.description,
          })),
        });

        if (clack.isCancel(scenario)) {
          clack.cancel("Operation cancelled.");
          process.exit(0);
        }

        toEmail =
          SES_SIMULATOR_ADDRESSES[
            scenario as keyof typeof SES_SIMULATOR_ADDRESSES
          ];
      } else {
        const result = await clack.text({
          message: "Enter recipient email:",
          placeholder: "you@example.com",
          validate: (value) => {
            if (!value) {
              return "Email is required";
            }
            if (!value.includes("@")) {
              return "Please enter a valid email address";
            }
            return;
          },
        });

        if (clack.isCancel(result)) {
          clack.cancel("Operation cancelled.");
          process.exit(0);
        }

        toEmail = result;
      }
    }
  }

  // 5. Sandbox recipient verification (for custom emails in sandbox mode)
  if (options.isSandbox && toEmail && !isSimulatorAddress(toEmail)) {
    progress.stop();
    clack.log.warn(
      `SES is in sandbox mode — recipient ${pc.cyan(toEmail)} must be verified to receive emails.`
    );

    const shouldVerify = await clack.confirm({
      message: `Send a verification email to ${toEmail} now?`,
      initialValue: true,
    });

    if (clack.isCancel(shouldVerify) || !shouldVerify) {
      clack.log.info(
        `Skipping recipient verification. You can use ${pc.cyan("success@simulator.amazonses.com")} instead.`
      );
      return;
    }

    const result = await verifySandboxRecipient(toEmail, region);
    if (!result.verified) {
      if (result.error) {
        clack.log.warn(`Could not send verification email: ${result.error}`);
      } else {
        clack.log.warn(
          "Recipient verification timed out. You can try again later or use a simulator address."
        );
      }
      return;
    }
  }

  // 6. Check domain verification status before sending
  const fromEmail = `test@${domain}`;
  const sesClient = new SESv2Client({ region });

  try {
    const identityResponse = await sesClient.send(
      new GetEmailIdentityCommand({ EmailIdentity: domain })
    );

    if (!identityResponse.VerifiedForSendingStatus) {
      progress.stop();
      const dkimStatus = identityResponse.DkimAttributes?.Status || "PENDING";

      if (options.postDeploy) {
        // Post-deploy: offer to wait for DNS verification instead of hard exit
        clack.log.warn(
          `Sending domain ${pc.cyan(domain)} is not yet verified (DKIM: ${dkimStatus})`
        );

        const shouldWait = await clack.confirm({
          message: "Wait for DNS verification? (typically a few minutes)",
          initialValue: true,
        });

        if (clack.isCancel(shouldWait) || !shouldWait) {
          clack.log.info(
            `You can send a test email later with ${pc.cyan("wraps email test")}`
          );
          return;
        }

        const verified = await pollDomainVerification(domain, region);
        if (!verified) {
          clack.log.warn(
            "DNS verification is still pending. You can retry later."
          );
          console.log(
            `\nRun ${pc.cyan(`wraps email domains verify --domain ${domain} --wait`)} to keep polling.\n`
          );
          return;
        }
      } else {
        // Standalone invocation: hard error
        clack.log.error(
          `Sending domain ${pc.cyan(domain)} is not yet verified (DKIM: ${dkimStatus})`
        );
        console.log(
          "\nDKIM DNS records need to propagate before you can send emails."
        );
        console.log("This typically takes a few minutes after deployment.\n");
        console.log(
          `Run ${pc.cyan(`wraps email domains verify --domain ${domain}`)} to check DNS status.\n`
        );
        process.exit(1);
        return;
      }
    }
    // baseline:allow-next-line no-swallowed-errors — verification check may fail due to permissions, proceed with send attempt
  } catch {
    clack.log.warn(
      "Could not check domain verification status — proceeding with send attempt"
    );
  }

  // 7. Send test email
  try {
    const messageId = await progress.execute(
      `Sending test email to ${toEmail}`,
      async () => {
        const client = sesClient;

        const response = await client.send(
          new SendEmailCommand({
            FromEmailAddress: fromEmail,
            Destination: { ToAddresses: [toEmail!] },
            Content: {
              Simple: {
                Subject: {
                  Data: "Test email from Wraps",
                  Charset: "UTF-8",
                },
                Body: {
                  Html: {
                    Data: `<h1>It works!</h1><p>This test email was sent from <strong>${domain}</strong> via Wraps.</p><p>Your email infrastructure is working correctly.</p>`,
                    Charset: "UTF-8",
                  },
                  Text: {
                    Data: `It works! This test email was sent from ${domain} via Wraps. Your email infrastructure is working correctly.`,
                    Charset: "UTF-8",
                  },
                },
              },
            },
            ConfigurationSetName: "wraps-email-tracking",
          })
        );

        return response.MessageId;
      }
    );

    progress.stop();

    // 8. Display success
    const isSimulator = isSimulatorAddress(toEmail!);

    // 9. Track success
    trackCommand("email:test", {
      success: true,
      is_simulator: isSimulator,
      duration_ms: Date.now() - startTime,
    });

    if (isJsonMode()) {
      jsonSuccess("email.test", {
        messageId: messageId || "unknown",
        from: fromEmail,
        to: toEmail!,
        isSimulator,
      });
      return;
    }

    console.log("\n");
    clack.log.success(pc.green("Test email sent successfully!"));
    console.log("");

    clack.note(
      [
        `${pc.bold("Message ID:")} ${pc.cyan(messageId || "unknown")}`,
        `${pc.bold("From:")} ${pc.cyan(fromEmail)}`,
        `${pc.bold("To:")} ${pc.cyan(toEmail)}`,
        "",
        isSimulator
          ? pc.dim(
              "Simulator emails are accepted by AWS but not actually delivered."
            )
          : pc.dim(
              "Check the recipient's inbox (and spam folder) for the email."
            ),
      ].join("\n"),
      "Email Sent"
    );

    clack.outro(pc.green("Test complete!"));
  } catch (error: unknown) {
    progress.stop();

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : "";

    trackError("EMAIL_SEND_FAILED", "email:test", { error: errorMessage });
    trackCommand("email:test", {
      success: false,
      error: errorMessage,
      duration_ms: Date.now() - startTime,
    });

    // Handle specific SES errors
    if (
      errorName === "MessageRejected" ||
      errorMessage.includes("MessageRejected")
    ) {
      if (errorMessage.includes("not verified")) {
        // Parse which identity failed to distinguish FROM domain vs TO address
        const failedIdentityMatch = errorMessage.match(
          /identities failed the check.*?:\s*(.+)/i
        );
        const failedIdentity = failedIdentityMatch?.[1]?.trim();
        const isFromDomainFailure =
          failedIdentity &&
          (failedIdentity === fromEmail ||
            failedIdentity.endsWith(`@${domain}`) ||
            failedIdentity === domain);

        if (isFromDomainFailure) {
          clack.log.error(
            `Sending domain ${pc.cyan(domain)} is not yet verified`
          );
          console.log(
            "\nDKIM DNS records need to propagate before you can send emails."
          );
          console.log("This typically takes a few minutes after deployment.\n");
          console.log(
            `Run ${pc.cyan(`wraps email domains verify --domain ${domain}`)} to check DNS status.\n`
          );
        } else {
          clack.log.error("Email address is not verified");
          console.log(
            "\nIn sandbox mode, recipient addresses must be verified."
          );
          console.log(
            `Simulator addresses always work: ${pc.cyan("success@simulator.amazonses.com")}\n`
          );
        }
      } else {
        clack.log.error(`Email rejected: ${errorMessage}`);
      }
    } else if (errorName === "MailFromDomainNotVerifiedException") {
      clack.log.error("Sending domain is not verified");
      console.log(
        `\nRun ${pc.cyan(`wraps email verify --domain ${domain}`)} to check DNS status.\n`
      );
    } else if (
      errorName === "SendingPausedException" ||
      errorName === "AccountSuspendedException"
    ) {
      clack.log.error("Email sending is disabled on this account");
      console.log("\nCheck the AWS SES console for account status.\n");
    } else if (errorName === "NotFoundException") {
      clack.log.error(
        "Configuration set not found. Your infrastructure may need to be redeployed."
      );
      console.log(
        `\nRun ${pc.cyan("wraps email status")} to check your setup.\n`
      );
    } else {
      clack.log.error(`Failed to send email: ${errorMessage}`);
    }

    process.exit(1);
  }
}
