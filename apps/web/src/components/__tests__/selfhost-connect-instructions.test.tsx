/**
 * Self-hosted AWS connect instructions.
 *
 * Regression coverage for the bug where a self-hosted dashboard offered a
 * CloudFormation quick-create link pointing at Wraps' S3-hosted template. That
 * template creates `wraps-console-access-role` trusting the Wraps platform
 * account `905130073023` — a role a self-hosted control plane can neither
 * assume nor find. The stack deploys fine and the dashboard silently never
 * works, so the only safe behaviour is to not render the link at all.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AWSAccountList } from "../aws-account-list";
import { ConnectAWSAccountForm } from "../forms/connect-aws-account-form";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

vi.mock("@/actions/aws-accounts", () => ({
  connectAWSAccountAction: vi.fn(),
}));

const PLATFORM_ACCOUNT_ID = "905130073023";
const CFN_CONSOLE_HOST = "console.aws.amazon.com";
const WRAPS_TEMPLATE_BUCKET = "wraps-assets";
const SELFHOST_CLI_COMMAND = "wraps selfhost connect";

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

/**
 * Reads every href in the tree plus the rendered text. The bug is about a link
 * being present at all, so assertions look at markup rather than a label.
 */
function renderedMarkup() {
  return document.body.innerHTML;
}

const account = {
  id: "acct-1",
  name: "Production",
  accountId: "111122223333",
  region: "us-east-1",
  externalId: "wraps_test_external_id",
  isVerified: true,
  permissions: { canView: true, canSend: true, canManage: true },
} as unknown as Parameters<typeof AWSAccountList>[0]["accounts"][number];

describe("self-hosted AWS connect instructions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("ConnectAWSAccountForm", () => {
    it("renders the CloudFormation quick-create link on the hosted platform", async () => {
      render(
        <ConnectAWSAccountForm organizationId="org-1" selfHosted={false} />
      );

      const link = await screen.findByRole("link", { name: /deploy to aws/i });
      const href = link.getAttribute("href") ?? "";

      expect(href).toContain(`${CFN_CONSOLE_HOST}/cloudformation`);
      expect(href).toContain(
        encodeURIComponent(
          "https://wraps-assets.s3.amazonaws.com/cloudformation/wraps-console-access-role.yaml"
        )
      );
    });

    it("renders no CloudFormation link at all when self-hosted", async () => {
      render(
        <ConnectAWSAccountForm organizationId="org-1" selfHosted={true} />
      );

      await screen.findByText(/connect with the cli/i);

      expect(
        screen.queryByRole("link", { name: /deploy to aws/i })
      ).not.toBeInTheDocument();
      expect(renderedMarkup()).not.toContain(CFN_CONSOLE_HOST);
      expect(renderedMarkup()).not.toContain(WRAPS_TEMPLATE_BUCKET);
    });

    it("shows the self-hosted CLI command when self-hosted", async () => {
      render(
        <ConnectAWSAccountForm organizationId="org-1" selfHosted={true} />
      );

      expect(await screen.findByText(SELFHOST_CLI_COMMAND)).toBeInTheDocument();
    });

    it("never shows the Wraps platform account ID when self-hosted", async () => {
      render(
        <ConnectAWSAccountForm organizationId="org-1" selfHosted={true} />
      );

      await screen.findByText(/connect with the cli/i);

      expect(renderedMarkup()).not.toContain(PLATFORM_ACCOUNT_ID);
    });
  });

  describe("AWSAccountList", () => {
    it("sends repair to the account page, not a CloudFormation quick-create", () => {
      render(
        <AWSAccountList
          accounts={[account]}
          organizationId="org-1"
          orgSlug="acme"
          selfHosted={false}
        />
      );

      const link = screen.getByRole("link", { name: /repair iam role/i });
      expect(link.getAttribute("href")).toBe(
        "/acme/settings/aws-accounts/acct-1#iam-role"
      );
      // Every account in this list is already connected, and a quick-create
      // link can only create: `stackName` must be unique per region and the
      // template declares a fixed RoleName, so pointing repair at one returns
      // AlreadyExists. The fix must not regress to that.
      expect(renderedMarkup()).not.toContain("stacks/create/review");
    });

    it("renders no CloudFormation link and shows the CLI command when self-hosted", () => {
      render(
        <AWSAccountList
          accounts={[account]}
          organizationId="org-1"
          orgSlug="acme"
          selfHosted={true}
        />
      );

      expect(
        screen.queryByRole("link", { name: /repair iam role/i })
      ).not.toBeInTheDocument();
      expect(renderedMarkup()).not.toContain(CFN_CONSOLE_HOST);
      expect(renderedMarkup()).not.toContain(WRAPS_TEMPLATE_BUCKET);
      expect(renderedMarkup()).not.toContain(PLATFORM_ACCOUNT_ID);
      expect(screen.getByText(SELFHOST_CLI_COMMAND)).toBeInTheDocument();
    });
  });
});
