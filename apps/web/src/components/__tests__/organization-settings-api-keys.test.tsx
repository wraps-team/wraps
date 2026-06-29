/**
 * OrganizationSettingsApiKeys Tests
 *
 * Regression coverage for Sentry WEB-H: "TypeError: Load failed" surfaced as an
 * unhandled promise rejection (onunhandledrejection) on /settings/api-keys.
 * The page-load data fetch (listApiKeys) was awaited inside a fire-and-forget
 * effect with no error handling, so a Safari network failure escaped as an
 * unhandled rejection instead of being surfaced to the user.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/api-keys", () => ({
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  updateApiKey: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "test-org" }),
}));

vi.mock(
  "@/app/(dashboard)/[orgSlug]/emails/analytics/hooks/use-analytics",
  () => ({
    useVolumeData: () => ({ data: [] }),
  })
);

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { toast } from "sonner";
import { listApiKeys } from "@/actions/api-keys";
import { OrganizationSettingsApiKeys } from "../organization-settings-api-keys";

const organization = { id: "org_123", name: "Test Org" };

describe("OrganizationSettingsApiKeys", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("surfaces an error toast when the initial load fails instead of leaving the rejection unhandled", async () => {
    // Safari reports a failed fetch as "TypeError: Load failed".
    vi.mocked(listApiKeys).mockRejectedValue(new TypeError("Load failed"));

    render(
      <OrganizationSettingsApiKeys
        organization={organization}
        userRole="owner"
      />
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("renders the keys panel when the initial load succeeds", async () => {
    vi.mocked(listApiKeys).mockResolvedValue({ success: true, apiKeys: [] });

    render(
      <OrganizationSettingsApiKeys
        organization={organization}
        userRole="owner"
      />
    );

    expect(await screen.findByText("API Keys")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
