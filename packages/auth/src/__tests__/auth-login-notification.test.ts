/**
 * Login Notification Tests
 *
 * Verifies that createLoginNotification hands the "new sign-in" notification
 * to notifyUser (./notify) with the right shape. notifyUser is mocked, so this
 * is a pure unit test and touches no database. The session.create.after hook
 * is too tightly coupled to better-auth to unit test in isolation, so the
 * extracted function is tested directly.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@wraps/email", () => ({ getWrapsClient: vi.fn() }));
vi.mock("../notify", () => ({ notifyUser: vi.fn() }));

import { createLoginNotification } from "../index";
import { notifyUser } from "../notify";

const notifyUserMock = vi.mocked(notifyUser);

describe("createLoginNotification", () => {
  it("sends an unread security notification with ip and agent context", async () => {
    notifyUserMock.mockClear();

    await createLoginNotification(
      "login-notif-user-a",
      "203.0.113.7",
      "TestAgent/1.0"
    );

    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith({
      userId: "login-notif-user-a",
      type: "security.new_device_login",
      title: "New sign-in to your account",
      body: expect.stringContaining("203.0.113.7"),
      href: "/settings/security",
      data: { ipAddress: "203.0.113.7", userAgent: "TestAgent/1.0" },
    });
  });

  it("handles missing ip/agent without failing the auth flow", async () => {
    notifyUserMock.mockClear();

    await createLoginNotification("login-notif-user-a");

    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    expect(notifyUserMock).toHaveBeenCalledWith({
      userId: "login-notif-user-a",
      type: "security.new_device_login",
      title: "New sign-in to your account",
      body: expect.stringContaining("an unknown IP"),
      href: "/settings/security",
      data: { ipAddress: null, userAgent: null },
    });
  });

  it("swallows a notifyUser rejection and reports it", async () => {
    notifyUserMock.mockRejectedValueOnce(new Error("notify failed"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      createLoginNotification("login-notif-user-a", "203.0.113.7")
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "[auth] login notification failed:",
      expect.any(Error)
    );
    consoleError.mockRestore();
  });
});
