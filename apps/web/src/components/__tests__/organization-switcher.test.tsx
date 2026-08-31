/**
 * OrganizationSwitcher — role badge regression test
 *
 * Plan 225 (step 1) stops `(dashboard)/layout.tsx` from seeding
 * `OrganizationProvider` with a server-rendered `initialUserRole`. Step 1a
 * replaced that source with a client-side derivation, because
 * better-auth's `getFullOrganization` payload
 * (`authClient.useActiveOrganization()`) has no top-level `role` — the role
 * lives on the member row, matched by user id.
 *
 * There was no test for this component before this plan, which is exactly
 * why the regression step 1a fixes would have shipped silently. This file
 * mocks `@/lib/auth-client` (not the context, which is the thing under test)
 * with a payload shaped like the real one — organization columns plus a
 * `members` array, and deliberately no top-level `role` — and renders the
 * real `OrganizationProvider` + `OrganizationSwitcher` together.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom has no matchMedia; useSidebar's mobile-breakpoint hook calls it on
// mount.
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {
    // no OS preference or viewport changes in jsdom
  },
  removeEventListener() {
    // no-op
  },
})) as unknown as typeof matchMedia;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ orgSlug: "acme" }),
}));
vi.mock("posthog-js", () => ({
  default: { group: vi.fn(), capture: vi.fn() },
}));

const activeOrgPayload = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  logo: null,
  brandColor: null,
  metadata: null,
  stripeOrganizationId: null,
  createdAt: new Date().toISOString(),
  members: [{ userId: "user_1", role: "owner" }],
  invitations: [],
};

// Mutable so each test can shape the payload without redefining the mock.
let activeOrgData: typeof activeOrgPayload | Record<string, unknown> =
  activeOrgPayload;

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useActiveOrganization: () => ({ data: activeOrgData, isPending: false }),
    useSession: () => ({ data: { user: { id: "user_1" } } }),
    organization: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      setActive: vi.fn(),
    },
  },
}));

import { OrganizationSwitcher } from "@/components/organization-switcher";
import { SidebarProvider } from "@/components/ui/sidebar";
import { OrganizationProvider } from "@/contexts/organization-context";

function renderSwitcher() {
  return render(
    <SidebarProvider>
      <OrganizationProvider>
        <OrganizationSwitcher />
      </OrganizationProvider>
    </SidebarProvider>
  );
}

afterEach(() => {
  cleanup();
  activeOrgData = activeOrgPayload;
});

describe("OrganizationSwitcher role badge", () => {
  it("shows the owner badge with no initialUserRole prop, deriving it from members", () => {
    renderSwitcher();
    // Positive control: the component got past its isLoading/!activeOrganization
    // skeleton guard and rendered the real org.
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
  });

  it("teeth: shows no badge when the signed-in user is not in the members array", () => {
    activeOrgData = {
      ...activeOrgPayload,
      members: [{ userId: "someone_else", role: "owner" }],
    };
    renderSwitcher();
    // Still past the skeleton guard...
    expect(screen.getByText("Acme")).toBeInTheDocument();
    // ...but the badge text is absent, proving the assertion above matches on
    // the derivation and not on any text that happens to be on screen.
    expect(screen.queryByText("owner")).not.toBeInTheDocument();
  });
});
