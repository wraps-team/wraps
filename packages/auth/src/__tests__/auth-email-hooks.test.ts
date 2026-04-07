import { beforeEach, describe, expect, it, vi } from "vitest";

const { getWrapsClientMock, sendTemplateMock } = vi.hoisted(() => {
  const sendTemplateMock = vi.fn();
  const getWrapsClientMock = vi.fn(async () => ({
    sendTemplate: sendTemplateMock,
  }));

  return {
    getWrapsClientMock,
    sendTemplateMock,
  };
});

vi.mock("@wraps/email", () => ({
  getWrapsClient: getWrapsClientMock,
}));

import { auth } from "../index";

type EmailAndPasswordOptions = NonNullable<typeof auth.options.emailAndPassword>;
type SendResetPasswordHandler = NonNullable<
  EmailAndPasswordOptions["sendResetPassword"]
>;
type OnPasswordResetHandler = NonNullable<
  EmailAndPasswordOptions["onPasswordReset"]
>;
type SendResetPasswordParams = Parameters<SendResetPasswordHandler>[0];
type OnPasswordResetParams = Parameters<OnPasswordResetHandler>[0];

const emailAndPassword = auth.options.emailAndPassword;

if (!emailAndPassword?.sendResetPassword || !emailAndPassword.onPasswordReset) {
  throw new Error("Expected Better Auth email hooks to be configured");
}

describe("Better Auth email hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendTemplateMock.mockResolvedValue(undefined);
    getWrapsClientMock.mockResolvedValue({
      sendTemplate: sendTemplateMock,
    });
  });

  it("sends password reset emails from hello@wraps.dev", async () => {
    const params: SendResetPasswordParams = {
      user: {
        email: "user@example.com",
        name: "Test User",
      },
      url: "https://app.wraps.dev/reset-password?token=test-token",
    };

    await emailAndPassword.sendResetPassword(params);

    expect(getWrapsClientMock).toHaveBeenCalledTimes(1);
    expect(sendTemplateMock).toHaveBeenCalledWith({
      from: "Wraps <hello@wraps.dev>",
      to: "user@example.com",
      template: "Password-Reset",
      templateData: {
        privacyUrl: "https://wraps.dev/privacy",
        resetPasswordUrl:
          "https://app.wraps.dev/reset-password?token=test-token",
        name: "Test User",
        email: "user@example.com",
      },
    });
  });

  it("sends password changed emails from hello@wraps.dev", async () => {
    const params: OnPasswordResetParams = {
      user: {
        email: "user@example.com",
        name: "Test User",
      },
    };

    await emailAndPassword.onPasswordReset(params);

    expect(getWrapsClientMock).toHaveBeenCalledTimes(1);
    expect(sendTemplateMock).toHaveBeenCalledWith({
      from: "Wraps <hello@wraps.dev>",
      to: "user@example.com",
      template: "Password-Changed",
      templateData: {
        name: "Test User",
        email: "user@example.com",
      },
    });
  });
});
