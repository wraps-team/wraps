// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RoleStatus } from "../../lib/role-status";
import { StatusList } from "../overview/status-list";

afterEach(cleanup);

const roleStatus: RoleStatus = {
  level: "healthy",
  label: "Reachable",
  detail: "Last reached 1h ago",
  needsRepair: false,
};

function renderList(scannedAt: string | null = null) {
  return render(
    <StatusList
      accountId="acct-1"
      emailEnabled={true}
      lastEventReceivedAt={null}
      orgSlug="acme"
      region="us-east-1"
      roleStatus={roleStatus}
      scannedAt={scannedAt}
      smsEnabled={false}
      staleSince={null}
      webhookConnected={true}
    />
  );
}

describe("StatusList", () => {
  it("leads with Role access, which has no region, then regional rows", () => {
    renderList();

    const role = screen.getByText("Role access");
    const streaming = screen.getByText("Event streaming · us-east-1");
    expect(
      role.compareDocumentPosition(streaming) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(role.textContent).not.toContain("us-east-1");
    expect(screen.getByText("Infrastructure · us-east-1")).toBeInTheDocument();
  });

  it("links to the Connection and Services tabs", () => {
    renderList();

    const connectionLinks = screen.getAllByRole("link", {
      name: "Connection →",
    });
    expect(connectionLinks).toHaveLength(2);
    for (const link of connectionLinks) {
      expect(link).toHaveAttribute(
        "href",
        "/acme/settings/aws-accounts/acct-1/connection"
      );
    }
    expect(screen.getByRole("link", { name: "Services →" })).toHaveAttribute(
      "href",
      "/acme/settings/aws-accounts/acct-1/services"
    );
  });

  it("says 'not scanned yet' when there is no scan time, and 'scanned ...' otherwise", () => {
    const { unmount } = renderList();
    expect(screen.getByText("not scanned yet")).toBeInTheDocument();
    unmount();

    renderList(new Date().toISOString());
    expect(screen.getByText(/^scanned /)).toBeInTheDocument();
    expect(screen.queryByText("not scanned yet")).not.toBeInTheDocument();
  });
});
