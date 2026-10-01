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
import type { AccountRow } from "@/lib/aws/account-status";
import { ConnectAWSAccountForm } from "../forms/connect-aws-account-form";
import { OrganizationSettingsAwsAccounts } from "../organization-settings-aws-accounts";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

vi.mock("@/actions/aws-accounts", () => ({
  connectAWSAccountAction: vi.fn(),
  deleteAWSAccount: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "acme" }),
  useRouter: () => ({ refresh: vi.fn() }),
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

const account: AccountRow = {
  id: "acct-1",
  name: "Production",
  accountId: "111122223333",
  region: "us-east-1",
  emailEnabled: true,
  smsEnabled: false,
  status: {
    level: "critical",
    label: "Role unreachable",
    detail: "Last reached 4h ago",
  },
  lastEventAt: null,
};

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

  describe("OrganizationSettingsAwsAccounts repair link", () => {
    it("sends repair to the account page, not a CloudFormation quick-create", () => {
      render(
        <OrganizationSettingsAwsAccounts
          accounts={[account]}
          organization={{ id: "org-1", name: "Acme" }}
          selfHosted={false}
          unlimited={true}
          userRole="owner"
        />
      );

      const link = screen.getByRole("link", { name: "Fix" });
      expect(link.getAttribute("href")).toBe(
        "/acme/settings/aws-accounts/acct-1/connection#iam-role"
      );
      // Every account in this list is already connected, and a quick-create
      // link can only create: `stackName` must be unique per region and the
      // template declares a fixed RoleName, so pointing repair at one returns
      // AlreadyExists. The fix must not regress to that.
      expect(renderedMarkup()).not.toContain("stacks/create/review");
    });

    it("renders no CloudFormation link when self-hosted", () => {
      render(
        <OrganizationSettingsAwsAccounts
          accounts={[account]}
          organization={{ id: "org-1", name: "Acme" }}
          selfHosted={true}
          unlimited={true}
          userRole="owner"
        />
      );

      expect(renderedMarkup()).not.toContain(CFN_CONSOLE_HOST);
      expect(renderedMarkup()).not.toContain(WRAPS_TEMPLATE_BUCKET);
      expect(renderedMarkup()).not.toContain(PLATFORM_ACCOUNT_ID);
    });
  });
});
