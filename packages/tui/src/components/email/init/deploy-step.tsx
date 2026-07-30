import { useKeyboard } from "@opentui/react";
import { useEffect, useRef } from "react";
import { useShortcuts } from "../../../contexts/shortcuts";
import { useDeploy } from "../../../hooks/use-deploy";
import { isEnter } from "../../../lib/keys";
import type { InitConfig } from "../../../types";
import { StepIndicator } from "../../shared/step-indicator";

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes require control characters
const ANSI_REGEX = /\x1B\[[0-9;]*m/g;

type DeployStepProps = {
  config: InitConfig;
  onComplete: () => void;
  onBack: () => void;
  stepIndex: number;
};

export function DeployStep({
  config,
  onComplete,
  onBack,
  stepIndex,
}: DeployStepProps) {
  const { status, output, error, start } = useDeploy();
  const started = useRef(false);
  const { setShortcuts, clearShortcuts } = useShortcuts();

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      start(config);
    }
  }, [config, start]);

  // Status-aware footer shortcuts
  useEffect(() => {
    if (status === "running") {
      setShortcuts([]);
    } else if (status === "done") {
      setShortcuts([{ key: "enter", label: "Continue" }]);
    } else if (status === "error") {
      setShortcuts([
        { key: "enter", label: "Go back" },
        { key: "esc", label: "Go back" },
      ]);
    }
    return clearShortcuts;
  }, [status, setShortcuts, clearShortcuts]);

  useKeyboard((key) => {
    if (status === "done" && (isEnter(key.name) || key.name === "escape")) {
      onComplete();
    }
    if (status === "error" && (key.name === "escape" || isEnter(key.name))) {
      onBack();
    }
  });

  // Parse output lines for progress display
  const progressLines = output.map(parseLine);

  return (
    <box flexDirection="column" padding={1} width="100%">
      <text fg="#00AAFF">
        <b>Deploying Infrastructure</b>
      </text>
      <text fg="#444444">{"─".repeat(60)}</text>
      <text> </text>

      <StepIndicator currentIndex={stepIndex} />
      <text> </text>

      {status === "running" && (
        <box flexDirection="column">
          {progressLines.map((line, i) => (
            <text fg={line.color} key={i}>
              {line.prefix} {line.text}
            </text>
          ))}
          {output.length === 0 && (
            <text fg="#FFFF00">Starting deployment...</text>
          )}
        </box>
      )}

      {status === "done" && (
        <box flexDirection="column">
          {progressLines.map((line, i) => (
            <text fg={line.color} key={i}>
              {line.prefix} {line.text}
            </text>
          ))}
          <text> </text>
          <text fg="#00FF00">
            <b>Deployment complete!</b>
          </text>
          <text> </text>

          {/* DNS records hint */}
          <text fg="#AAAAAA">
            <b>Next Steps</b>
          </text>
          <text fg="#AAAAAA">
            1. Add the DNS records shown above to verify your domain
          </text>
          <text fg="#AAAAAA">
            2. Install the SDK: npm install @wraps.dev/email
          </text>
          <text> </text>

          {/* SDK snippet with actual domain */}
          <text fg="#444444">{"─".repeat(50)}</text>
          <text fg="#888888">Quick start:</text>
          <text> </text>
          <text fg="#00AAFF">
            {"import { WrapsEmail } from '@wraps.dev/email';"}
          </text>
          <text> </text>
          <text fg="#FFFFFF">{"const email = new WrapsEmail();"}</text>
          <text fg="#FFFFFF">{"await email.send({"}</text>
          <text fg="#FFFFFF">{`  from: 'hello@${config.domain}',`}</text>
          <text fg="#FFFFFF">{"  to: 'user@example.com',"}</text>
          <text fg="#FFFFFF">{"  subject: 'Hello from Wraps!',"}</text>
          <text fg="#FFFFFF">{"  html: '<h1>It works!</h1>',"}</text>
          <text fg="#FFFFFF">{"});"}</text>
          <text fg="#444444">{"─".repeat(50)}</text>
          <text> </text>

          <text fg="#666666">Press Enter or ESC to return to dashboard</text>
        </box>
      )}

      {status === "error" && (
        <box flexDirection="column">
          {progressLines.map((line, i) => (
            <text fg={line.color} key={i}>
              {line.prefix} {line.text}
            </text>
          ))}
          <text> </text>
          <text fg="#FF4444">
            <b>Deployment failed</b>
          </text>
          {error && <text fg="#FF4444">{error}</text>}
          <text> </text>
          <text fg="#888888">
            Check the output above for details. Common issues:
          </text>
          <text fg="#888888">- Insufficient IAM permissions</text>
          <text fg="#888888">
            - Pulumi state lock (another deployment in progress)
          </text>
          <text fg="#888888">- Network connectivity issues</text>
          <text> </text>
          <text fg="#666666">Press Enter or ESC to go back</text>
        </box>
      )}
    </box>
  );
}

type ParsedLine = {
  prefix: string;
  text: string;
  color: string;
};

function parseLine(line: string): ParsedLine {
  // Strip ANSI codes
  const clean = line.replace(ANSI_REGEX, "").trim();

  if (clean.includes("✓") || clean.includes("✔") || clean.includes("done")) {
    return {
      prefix: "  ✓",
      text: clean.replace(/[✓✔]/g, "").trim(),
      color: "#00FF00",
    };
  }
  if (
    clean.includes("✗") ||
    clean.includes("error") ||
    clean.includes("Error")
  ) {
    return {
      prefix: "  ✗",
      text: clean.replace(/[✗]/g, "").trim(),
      color: "#FF4444",
    };
  }
  if (
    clean.includes("●") ||
    clean.includes("...") ||
    clean.includes("Creating") ||
    clean.includes("Deploying")
  ) {
    return {
      prefix: "  ●",
      text: clean.replace(/[●]/g, "").trim(),
      color: "#FFFF00",
    };
  }
  if (
    clean.includes("CNAME") ||
    clean.includes("_domainkey") ||
    clean.includes("dkim")
  ) {
    return { prefix: "   ", text: clean, color: "#00AAFF" };
  }
  return { prefix: "   ", text: clean, color: "#AAAAAA" };
}
