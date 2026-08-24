/**
 * CliDeployConnectStep — the three-path Deploy & Connect step.
 *
 * Pins the layout decisions (three peer cards, CLI first), every analytics
 * capture the funnel depends on, and the self-hosted gate that must never
 * offer a platform CloudFormation link to a self-hosted control plane.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCapture, mockWriteText, mockToastError, mockToastSuccess } =
  vi.hoisted(() => ({
    mockCapture: vi.fn(),
    mockWriteText: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
  }));

vi.mock("posthog-js", () => ({
  default: { capture: mockCapture },
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
    info: vi.fn(),
  },
}));

vi.mock("lucide-react", () => ({
  BotIcon: () => <svg data-testid="bot-icon" />,
  CalendarIcon: () => <svg data-testid="calendar-icon" />,
  CheckCircle2Icon: () => <svg data-testid="check-circle-icon" />,
  CheckIcon: () => <svg data-testid="check-icon" />,
  ChevronDownIcon: () => <svg data-testid="chevron-down-icon" />,
  CloudIcon: () => <svg data-testid="cloud-icon" />,
  CopyIcon: () => <svg data-testid="copy-icon" />,
  ExternalLinkIcon: () => <svg data-testid="external-link-icon" />,
  Loader2Icon: () => <svg data-testid="loader-icon" />,
  RefreshCwIcon: () => <svg data-testid="refresh-icon" />,
  TerminalIcon: () => <svg data-testid="terminal-icon" />,
}));

const mockOpen = vi.fn();
const mockFetch = vi.fn();
vi.stubGlobal("open", mockOpen);
vi.stubGlobal("fetch", mockFetch);

import { CliDeployConnectStep } from "../cli-deploy-connect-step";

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

/**
 * Reads every href in the tree plus the rendered text. The self-hosted bug is
 * about a platform-only string being present at all, so assertions look at
 * markup rather than at a label.
 */
function renderedMarkup() {
  return document.body.innerHTML;
}

const PLATFORM_ACCOUNT_ID = "905130073023";
const CFN_CONSOLE_HOST = "console.aws.amazon.com";
const WRAPS_TEMPLATE_BUCKET = "wraps-assets";
const SELFHOST_CLI_COMMAND = "wraps selfhost connect";
const HOSTED_CLI_COMMAND = "wraps platform connect";
const SELFHOST_LOGIN_COMMAND = "wraps selfhost login";
const HOSTED_LOGIN_COMMAND = "wraps auth login";
const INSTALL_CLI_COMMAND = "curl -fsSL https://get.wraps.dev | sh";
const CAL_BOOKING_URL = "https://cal.com/wraps/get-started-with-wraps";

const defaultProps = {
  onNext: vi.fn(),
  onBack: vi.fn(),
  onSkip: vi.fn(),
  onConnected: vi.fn(),
  organizationId: "org-123",
  orgName: "Test Org",
  orgSlug: "test-org",
};

function capturesOf(event: string) {
  return mockCapture.mock.calls.filter(([name]) => name === event);
}

describe("CliDeployConnectStep — three-path layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("offers all three deployment paths as peers on mount", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    expect(screen.getByRole("heading", { name: /^CLI/ })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "AI agent" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Browser" })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /use the cli/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy the agent prompt/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /use the browser/i })
    ).toBeInTheDocument();
  });

  it("leads with the CLI card and marks it Recommended", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    const headings = screen.getAllByRole("heading", { level: 3 });

    expect(headings[0]).toHaveTextContent(/^CLI/);
    expect(headings[0]).toHaveTextContent("Recommended");
    expect(headings[1]).toHaveTextContent("AI agent");
    expect(headings[2]).toHaveTextContent("Browser");
  });

  it("captures no method-selected event before the user chooses", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    expect(capturesOf("onboarding_deployment_method_selected")).toHaveLength(0);
  });

  it("captures the CLI choice once, however many times it is clicked", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));

    expect(mockCapture).toHaveBeenCalledWith(
      "onboarding_deployment_method_selected",
      {
        step: 4,
        step_name: "Deploy & Connect",
        organization_id: "org-123",
        method: "cli",
        layout: "three_path",
      }
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));

    const cliSelections = capturesOf(
      "onboarding_deployment_method_selected"
    ).filter(([, payload]) => payload.method === "cli");
    expect(cliSelections).toHaveLength(1);
  });

  it("captures the agent and browser choices with their own method values", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /copy the agent prompt/i })
    );

    expect(mockCapture).toHaveBeenCalledWith(
      "onboarding_deployment_method_selected",
      {
        step: 4,
        step_name: "Deploy & Connect",
        organization_id: "org-123",
        method: "agent",
        layout: "three_path",
      }
    );

    fireEvent.click(screen.getByRole("button", { name: /use the browser/i }));

    expect(mockCapture).toHaveBeenCalledWith(
      "onboarding_deployment_method_selected",
      {
        step: 4,
        step_name: "Deploy & Connect",
        organization_id: "org-123",
        method: "cloudformation",
        layout: "three_path",
      }
    );
  });

  it("reports one CLI deployment start however many commands are copied", async () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));

    const copyButtons = screen.getAllByRole("button", {
      name: /^copy .+ command$/i,
    });
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(capturesOf("onboarding_cli_command_copied")).toHaveLength(1);
    });
    expect(mockWriteText).toHaveBeenCalledWith(INSTALL_CLI_COMMAND);
    expect(capturesOf("onboarding_cli_command_copied")[0][1]).toEqual({
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: "org-123",
      command: INSTALL_CLI_COMMAND,
    });
    expect(mockCapture).toHaveBeenCalledWith("onboarding_deployment_started", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: "org-123",
      method: "cli",
      layout: "three_path",
    });

    fireEvent.click(copyButtons[1]);

    await waitFor(() => {
      expect(capturesOf("onboarding_cli_command_copied")).toHaveLength(2);
    });
    expect(mockWriteText).toHaveBeenCalledWith(HOSTED_LOGIN_COMMAND);
    expect(capturesOf("onboarding_cli_command_copied")[1][1]).toEqual({
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: "org-123",
      command: HOSTED_LOGIN_COMMAND,
    });
    expect(capturesOf("onboarding_deployment_started")).toHaveLength(1);
  });

  it("copies the hosted connect command on the hosted platform", async () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));

    const copyButtons = screen.getAllByRole("button", {
      name: /^copy .+ command$/i,
    });
    fireEvent.click(copyButtons[copyButtons.length - 1]);

    await waitFor(() => {
      expect(capturesOf("onboarding_cli_command_copied")).toHaveLength(1);
    });
    expect(mockWriteText).toHaveBeenCalledWith(HOSTED_CLI_COMMAND);
    expect(capturesOf("onboarding_cli_command_copied")[0][1]).toMatchObject({
      command: HOSTED_CLI_COMMAND,
    });
  });

  /**
   * The clipboard is the artifact the user actually pastes into a terminal.
   * A self-hosted user who copies `wraps platform connect` hands their AWS
   * account to the hosted control plane — the exact failure the selfHosted
   * gate exists to prevent — and the screen would still read correctly.
   */
  it("copies the self-hosted commands, never the hosted ones, when self-hosted", async () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={true} />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));

    const copyButtons = screen.getAllByRole("button", {
      name: /^copy .+ command$/i,
    });
    fireEvent.click(copyButtons[copyButtons.length - 1]);

    await waitFor(() => {
      expect(capturesOf("onboarding_cli_command_copied")).toHaveLength(1);
    });
    expect(mockWriteText).toHaveBeenCalledWith(SELFHOST_CLI_COMMAND);
    expect(capturesOf("onboarding_cli_command_copied")[0][1]).toMatchObject({
      command: SELFHOST_CLI_COMMAND,
    });

    fireEvent.click(copyButtons[1]);

    await waitFor(() => {
      expect(capturesOf("onboarding_cli_command_copied")).toHaveLength(2);
    });
    expect(mockWriteText).toHaveBeenCalledWith(SELFHOST_LOGIN_COMMAND);

    for (const [command] of mockWriteText.mock.calls) {
      expect(command).not.toContain(HOSTED_CLI_COMMAND);
      expect(command).not.toContain(HOSTED_LOGIN_COMMAND);
    }
    for (const [, payload] of capturesOf("onboarding_cli_command_copied")) {
      expect(payload.command).not.toContain(HOSTED_CLI_COMMAND);
      expect(payload.command).not.toContain(HOSTED_LOGIN_COMMAND);
    }
  });

  it("reports an agent deployment start when the prompt is copied", async () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /copy the agent prompt/i })
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));

    await waitFor(() => {
      expect(capturesOf("onboarding_agent_prompt_copied")).toHaveLength(1);
    });
    expect(mockCapture).toHaveBeenCalledWith("onboarding_deployment_started", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: "org-123",
      method: "agent",
      layout: "three_path",
    });
  });

  it("reports nothing when the clipboard write fails", async () => {
    mockWriteText.mockRejectedValue(new Error("not allowed"));
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));
    fireEvent.click(
      screen.getAllByRole("button", { name: /^copy .+ command$/i })[0]
    );

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalled();
    });
    expect(capturesOf("onboarding_cli_command_copied")).toHaveLength(0);
    expect(capturesOf("onboarding_deployment_started")).toHaveLength(0);
  });

  it("reports the CloudFormation start before opening the console", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    expect(
      screen.queryByRole("button", { name: /deploy with cloudformation/i })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /use the browser/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /deploy with cloudformation/i })
    );

    expect(mockCapture).toHaveBeenCalledWith("onboarding_deployment_started", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: "org-123",
      method: "cloudformation",
      layout: "three_path",
    });

    const startedIndex = mockCapture.mock.calls.findIndex(
      ([name]) => name === "onboarding_deployment_started"
    );
    expect(mockCapture.mock.invocationCallOrder[startedIndex]).toBeLessThan(
      mockOpen.mock.invocationCallOrder[0]
    );
    expect(mockOpen.mock.calls[0][0]).toContain(
      "console.aws.amazon.com/cloudformation"
    );
  });

  it("validates the same webhook secret it deployed", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the browser/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /deploy with cloudformation/i })
    );

    const openedSecret = new URL(
      mockOpen.mock.calls[0][0].replace("#/", "")
    ).searchParams.get("param_WrapsWebhookSecret");
    expect(openedSecret).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Console Role ARN"), {
      target: {
        value: "arn:aws:iam::123456789012:role/wraps-console-access-role",
      },
    });
    fireEvent.change(screen.getByLabelText("External ID"), {
      target: { value: "wraps-0123456789abcdef0123456789abcdef" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /validate connection/i })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const posted = JSON.parse(String(mockFetch.mock.calls.at(-1)?.[1]?.body));
    expect(posted.webhookSecret).toBe(openedSecret);
  });

  /**
   * The CloudFormation arm of the funnel, past the request body. `onConnected`
   * and `onboarding_step_completed{method:"cloudformation"}` are the only
   * reasons a validated browser-path user ever leaves step 4 — drop them and
   * the screen still says "connected" while the user sits on the step forever
   * and the CFN funnel reads as 100% drop-off.
   */
  it("completes the step when the CloudFormation validation succeeds", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const onConnected = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    render(
      <QueryClientProvider client={queryClient}>
        <CliDeployConnectStep
          {...defaultProps}
          onConnected={onConnected}
          selfHosted={false}
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /use the browser/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /deploy with cloudformation/i })
    );
    fireEvent.change(screen.getByLabelText("Console Role ARN"), {
      target: {
        value: "arn:aws:iam::123456789012:role/wraps-console-access-role",
      },
    });
    fireEvent.change(screen.getByLabelText("External ID"), {
      target: { value: "wraps-0123456789abcdef0123456789abcdef" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /validate connection/i })
    );

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalled();
    });
    expect(mockCapture).toHaveBeenCalledWith("onboarding_step_completed", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: "org-123",
      method: "cloudformation",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["onboarding-status", "org-123"],
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Infrastructure connected successfully!"
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /**
   * The other half of the CloudFormation completion path. A failed validate is
   * the one place the user learns what to fix, and `onboarding_connection_failed`
   * carrying the API's own error code is what tells us which failure is eating
   * the browser path.
   */
  it("surfaces the CloudFormation remediation panel and reports the error code", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "Role not assumable",
        code: "ASSUME_ROLE_FAILED",
        remediation: "Check the trust policy on wraps-console-access-role.",
      }),
    });
    const onConnected = vi.fn();
    renderWithQueryClient(
      <CliDeployConnectStep
        {...defaultProps}
        onConnected={onConnected}
        selfHosted={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the browser/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /deploy with cloudformation/i })
    );
    fireEvent.change(screen.getByLabelText("Console Role ARN"), {
      target: {
        value: "arn:aws:iam::123456789012:role/wraps-console-access-role",
      },
    });
    fireEvent.change(screen.getByLabelText("External ID"), {
      target: { value: "wraps-0123456789abcdef0123456789abcdef" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /validate connection/i })
    );

    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert).toHaveTextContent("Role not assumable");
    expect(alert).toHaveTextContent(
      "Check the trust policy on wraps-console-access-role."
    );
    expect(
      within(alert).getByRole("link", { name: /book a setup call/i })
    ).toHaveAttribute("href", CAL_BOOKING_URL);
    expect(mockToastError).toHaveBeenCalledWith("Role not assumable");
    expect(mockCapture).toHaveBeenCalledWith("onboarding_connection_failed", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: "org-123",
      method: "cloudformation",
      error_code: "ASSUME_ROLE_FAILED",
    });
    expect(onConnected).not.toHaveBeenCalled();
    expect(capturesOf("onboarding_step_completed")).toHaveLength(0);
  });

  it("offers no CloudFormation path at all when self-hosted", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={true} />
    );

    expect(
      screen.queryByRole("button", { name: /use the browser/i })
    ).not.toBeInTheDocument();
    expect(renderedMarkup()).not.toContain(CFN_CONSOLE_HOST);
    expect(renderedMarkup()).not.toContain(WRAPS_TEMPLATE_BUCKET);
    expect(renderedMarkup()).not.toContain(PLATFORM_ACCOUNT_ID);
    expect(screen.getByText(SELFHOST_CLI_COMMAND)).toBeInTheDocument();
  });

  it("offers the CloudFormation path on the hosted platform", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    expect(
      screen.getByRole("button", { name: /use the browser/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(SELFHOST_CLI_COMMAND)).not.toBeInTheDocument();
  });

  /**
   * The CLI panel's opening line is the only guidance a user gets at the moment
   * they discover they have no AWS credentials on this machine. Self-hosted
   * renders no Browser card, so pointing there sends them looking for a card
   * that does not exist and leaves Skip as the only move. The copy has to name
   * a fallback the self-hosted page actually offers.
   */
  it("never sends a self-hosted user to a browser path the page does not render", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={true} />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));

    expect(
      screen.queryByRole("button", { name: /use the browser/i })
    ).not.toBeInTheDocument();
    expect(renderedMarkup()).not.toContain("browser path");
    expect(renderedMarkup()).toContain("wraps aws doctor");
  });

  it("keeps pointing a hosted user at the browser path it renders", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));

    expect(
      screen.getByRole("button", { name: /use the browser/i })
    ).toBeInTheDocument();
    expect(renderedMarkup()).toContain("browser path");
  });

  /**
   * The exact mirror of "never names the hosted connect command when
   * self-hosted". `wraps selfhost login` points at a control plane a hosted
   * org does not have, so a hosted user handed it can never authenticate and
   * never connects their AWS account. Both surfaces that name the commands —
   * the CLI panel and the agent prompt — have to be pinned in this direction
   * too, or an inverted ternary in either one ships silently.
   */
  it("never names the self-hosted commands on the hosted platform", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));

    expect(screen.getByText(HOSTED_LOGIN_COMMAND)).toBeInTheDocument();
    expect(screen.getByText(HOSTED_CLI_COMMAND)).toBeInTheDocument();
    expect(renderedMarkup()).not.toContain("wraps selfhost");

    fireEvent.click(
      screen.getByRole("button", { name: /copy the agent prompt/i })
    );
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    expect(renderedMarkup()).toContain(HOSTED_LOGIN_COMMAND);
    expect(renderedMarkup()).toContain(HOSTED_CLI_COMMAND);
    expect(renderedMarkup()).not.toContain("wraps selfhost");
  });

  it("completes the step when the CLI path reports a live connection", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ connections: [{}] }),
    });
    const onConnected = vi.fn();
    renderWithQueryClient(
      <CliDeployConnectStep
        {...defaultProps}
        onConnected={onConnected}
        selfHosted={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /i've finished — check connection/i })
    );

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalled();
    });
    expect(mockCapture).toHaveBeenCalledWith(
      "onboarding_cli_connection_detected",
      {
        step: 4,
        step_name: "Deploy & Connect",
        organization_id: "org-123",
      }
    );
    expect(mockCapture).toHaveBeenCalledWith("onboarding_step_completed", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: "org-123",
      method: "cli",
    });
  });

  /**
   * The most common state on this screen: the user clicks check before the
   * deploy has finished, so the check returns no connections. The remediation
   * copy that appears names a connect command — the third and last place a
   * self-hosted org could be handed the hosted one, and the only one that
   * renders behind `checkFailed`.
   */
  it("names only the self-hosted connect command when the check finds nothing", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ connections: [] }),
    });
    const onConnected = vi.fn();
    renderWithQueryClient(
      <CliDeployConnectStep
        {...defaultProps}
        onConnected={onConnected}
        selfHosted={true}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /i've finished — check connection/i })
    );

    await waitFor(() => {
      expect(screen.getByText(/no connection found\./i)).toBeInTheDocument();
    });
    expect(screen.getByText(/no connection found\./i)).toHaveTextContent(
      SELFHOST_CLI_COMMAND
    );
    expect(renderedMarkup()).not.toContain(HOSTED_CLI_COMMAND);
    expect(mockToastError).toHaveBeenCalledWith(
      "No connection found yet. Make sure you've run all 4 commands."
    );
    expect(onConnected).not.toHaveBeenCalled();
    expect(capturesOf("onboarding_step_completed")).toHaveLength(0);
  });

  it("surfaces the remediation copy when the connection request itself fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    const onConnected = vi.fn();
    renderWithQueryClient(
      <CliDeployConnectStep
        {...defaultProps}
        onConnected={onConnected}
        selfHosted={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /i've finished — check connection/i })
    );

    await waitFor(() => {
      expect(screen.getByText(/no connection found\./i)).toBeInTheDocument();
    });
    expect(screen.getByText(/no connection found\./i)).toHaveTextContent(
      HOSTED_CLI_COMMAND
    );
    expect(onConnected).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(capturesOf("onboarding_step_completed")).toHaveLength(0);
  });

  it("keeps Back and Skip on the canonical step keys", () => {
    const onBack = vi.fn();
    const onSkip = vi.fn();
    renderWithQueryClient(
      <CliDeployConnectStep
        {...defaultProps}
        onBack={onBack}
        onSkip={onSkip}
        selfHosted={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(onBack).toHaveBeenCalled();
    expect(onSkip).toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledWith("onboarding_step_back", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: "org-123",
    });
    expect(mockCapture).toHaveBeenCalledWith("onboarding_skipped", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: "org-123",
    });
    for (const [, payload] of mockCapture.mock.calls) {
      expect(payload.step_name).toBe("Deploy & Connect");
    }
  });

  it("closes the other paths once a stack is launching", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={false} />
    );

    fireEvent.click(screen.getByRole("button", { name: /use the browser/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /deploy with cloudformation/i })
    );

    expect(
      screen.queryByRole("button", { name: /use the cli/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /copy the agent prompt/i })
    ).not.toBeInTheDocument();
  });

  it("never names the hosted connect command when self-hosted", () => {
    renderWithQueryClient(
      <CliDeployConnectStep {...defaultProps} selfHosted={true} />
    );

    expect(renderedMarkup()).not.toContain(HOSTED_CLI_COMMAND);

    fireEvent.click(screen.getByRole("button", { name: /use the cli/i }));

    expect(renderedMarkup()).not.toContain(HOSTED_CLI_COMMAND);
    expect(screen.getByText("wraps selfhost login")).toBeInTheDocument();
    expect(
      screen.getAllByText(SELFHOST_CLI_COMMAND).length
    ).toBeGreaterThanOrEqual(1);

    fireEvent.click(
      screen.getByRole("button", { name: /copy the agent prompt/i })
    );
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    expect(renderedMarkup()).toContain("wraps selfhost login");
    expect(renderedMarkup()).not.toContain(HOSTED_CLI_COMMAND);
  });
});
