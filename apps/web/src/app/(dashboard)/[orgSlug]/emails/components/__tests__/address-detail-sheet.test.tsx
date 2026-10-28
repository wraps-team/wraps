/**
 * Address detail sheet: which controls show for each state, the copy for the
 * empty and error states, and the links. The server actions are mocked, so
 * this runs without a database or AWS.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressDetail } from "@/actions/address-detail";

const mockGetAddressDetail = vi.fn();
vi.mock("@/actions/address-detail", () => ({
  getAddressDetail: (...args: unknown[]) => mockGetAddressDetail(...args),
}));

const mockGetContactTimeline = vi.fn();
vi.mock("@/actions/contacts-analytics", () => ({
  getContactTimeline: (...args: unknown[]) => mockGetContactTimeline(...args),
}));

const mockRemoveSuppression = vi.fn();
vi.mock("@/actions/suppressions", () => ({
  removeSuppression: (...args: unknown[]) => mockRemoveSuppression(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AddressDetailSheet } from "../address-detail-sheet";

const ORG_ID = "org-sheet-test";
const ORG_SLUG = "acme";
const ADDRESS = "someone@example.com";

function detail(
  overrides: Partial<Extract<AddressDetail, { success: true }>> = {}
) {
  return {
    success: true as const,
    address: ADDRESS,
    totals: { sends: 0, bounces: 0, complaints: 0, suppressed: 0 },
    lastProblemAt: null,
    problemSends: [],
    problemSendsHasMore: false,
    suppressionAccount: { id: "aws-1", name: "Production" },
    retentionDays: 30,
    contact: null,
    ...overrides,
  };
}

const timelineOk = {
  success: true,
  events: [],
  hasMore: false,
  history: {
    agedOutEvents: 0,
    hasUnshowableHistory: false,
    recordedEmailsSent: 0,
    recordedSmsSent: 0,
  },
};

beforeEach(() => {
  mockGetAddressDetail.mockResolvedValue(detail());
  mockGetContactTimeline.mockResolvedValue(timelineOk);
  mockRemoveSuppression.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSheet(
  props: Partial<ComponentProps<typeof AddressDetailSheet>> = {}
) {
  const onClose = vi.fn();
  const onRemoved = vi.fn();
  render(
    <AddressDetailSheet
      address={ADDRESS}
      onClose={onClose}
      onRemoved={onRemoved}
      organizationId={ORG_ID}
      orgSlug={ORG_SLUG}
      suppression={null}
      {...props}
    />
  );
  return { onClose, onRemoved };
}

describe("AddressDetailSheet", () => {
  it("shows the Remove button only when opened from a suppression row", async () => {
    const { unmount } = render(
      <AddressDetailSheet
        address={ADDRESS}
        onClose={vi.fn()}
        organizationId={ORG_ID}
        orgSlug={ORG_SLUG}
        suppression={null}
      />
    );
    await screen.findByText(
      "Not checked against the AWS suppression list here."
    );
    expect(
      screen.queryByRole("button", { name: "Unsuppress" })
    ).not.toBeInTheDocument();
    unmount();

    render(
      <AddressDetailSheet
        address={ADDRESS}
        onClose={vi.fn()}
        organizationId={ORG_ID}
        orgSlug={ORG_SLUG}
        suppression={{
          awsAccountId: "aws-1",
          reason: "BOUNCE",
          lastUpdated: "2026-10-20T10:00:00.000Z",
        }}
      />
    );
    expect(
      await screen.findByRole("button", { name: "Unsuppress" })
    ).toBeInTheDocument();
  });

  it("shows the complaint date above Remove for a COMPLAINT entry", async () => {
    const complainedAt = "2026-10-21T09:00:00.000Z";
    mockGetAddressDetail.mockResolvedValue(
      detail({
        problemSends: [
          {
            id: "send-1",
            subject: "Hi",
            sourceType: "transactional",
            sourceName: null,
            templateName: null,
            sentAt: complainedAt,
            awsAccountId: "aws-1",
            complainedAt,
            suppressedAt: null,
            problem: {
              kind: "complaint",
              headline: "Reported as spam",
              detail: "The complaint type is not recorded.",
              severity: "permanent",
            },
          },
        ],
        totals: { sends: 1, bounces: 0, complaints: 1, suppressed: 0 },
      })
    );
    renderSheet({
      suppression: {
        awsAccountId: "aws-1",
        reason: "COMPLAINT",
        lastUpdated: complainedAt,
      },
    });
    const line = await screen.findByText(/Reported as spam on/);
    const button = await screen.findByRole("button", { name: "Unsuppress" });
    // The date line comes before the button in the document.
    expect(
      line.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("closes the sheet after a successful removal (onRemoved)", async () => {
    mockRemoveSuppression.mockResolvedValue({
      success: true,
      email: ADDRESS,
      wasPresent: true,
    });
    const { onRemoved } = renderSheet({
      suppression: {
        awsAccountId: "aws-1",
        reason: "BOUNCE",
        lastUpdated: "2026-10-20T10:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Unsuppress" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Remove from suppression list",
      })
    );
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
  });

  it('shows "Not found in your sends" for zero sends and no contact', async () => {
    renderSheet();
    expect(
      await screen.findByRole("heading", { name: "Not found in your sends" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your plan keeps 30 days of email history/)
    ).toBeInTheDocument();
    expect(
      screen.getByText("No contact has this address.")
    ).toBeInTheDocument();
  });

  it("shows the not-checked line and Open Suppression List link in the drill-down case", async () => {
    renderSheet();
    expect(
      await screen.findByText(
        "Not checked against the AWS suppression list here."
      )
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open Suppression List" });
    expect(link).toHaveAttribute("href", `/${ORG_SLUG}/emails/suppressions`);
  });

  it("shows the error state with a working Try again button", async () => {
    mockGetAddressDetail
      .mockResolvedValueOnce({
        success: false,
        error: "Could not load this address. Try again.",
      })
      .mockResolvedValueOnce(
        detail({
          totals: { sends: 0, bounces: 0, complaints: 0, suppressed: 0 },
        })
      );
    renderSheet();
    expect(
      await screen.findByText("Could not load this address. Try again.")
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Not found in your sends" })
    ).toBeInTheDocument();
    expect(mockGetAddressDetail).toHaveBeenCalledTimes(2);
  });

  it('shows "No contact has this address." when no contact matches', async () => {
    renderSheet();
    expect(
      await screen.findByText("No contact has this address.")
    ).toBeInTheDocument();
  });

  it("contact link is /{orgSlug}/contacts?contactId=...", async () => {
    mockGetAddressDetail.mockResolvedValue(
      detail({
        totals: { sends: 2, bounces: 0, complaints: 0, suppressed: 0 },
        contact: {
          id: "contact-42",
          name: "Pat Person",
          emailStatus: "active",
          createdAt: "2026-10-01T00:00:00.000Z",
          createdBy: null,
          creationRecord: null,
        },
      })
    );
    renderSheet();
    const link = await screen.findByRole("link", { name: "Open contact" });
    expect(link).toHaveAttribute(
      "href",
      `/${ORG_SLUG}/contacts?contactId=contact-42`
    );
    expect(screen.getByText("Created by: not recorded.")).toBeInTheDocument();
    expect(
      screen.getByText("How this contact was added is not recorded.")
    ).toBeInTheDocument();
  });

  it('"Open Suppression List" link has no address in its URL', async () => {
    renderSheet();
    const link = await screen.findByRole("link", {
      name: "Open Suppression List",
    });
    expect(link.getAttribute("href")).not.toContain("someone");
    expect(link.getAttribute("href")).not.toContain("@");
    // The sheet is client state: the address never reaches the page URL.
    expect(window.location.href).not.toContain("someone%40example.com");
    expect(within(document.body).getByText(ADDRESS)).toBeInTheDocument();
  });

  it("states a contact's non-active status and that broadcasts skip it", async () => {
    mockGetAddressDetail.mockResolvedValue(
      detail({
        totals: { sends: 1, bounces: 1, complaints: 0, suppressed: 0 },
        contact: {
          id: "contact-7",
          name: "Bounced Person",
          emailStatus: "bounced",
          createdAt: "2026-10-01T00:00:00.000Z",
          createdBy: null,
          creationRecord: null,
        },
      })
    );
    renderSheet();
    expect(
      await screen.findByText(
        /Wraps still treats this contact as bounced, so broadcasts and automations skip it./
      )
    ).toBeInTheDocument();
  });
});
