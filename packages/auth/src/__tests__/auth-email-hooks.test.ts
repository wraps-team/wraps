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

type EmailAndPasswordOptions = NonNullable<
  typeof auth.options.emailAndPassword
>;
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

  it("sends password reset emails using AUTH_EMAIL_FROM and AUTH_EMAIL_CONFIGURATION_SET", async () => {
    const params: SendResetPasswordParams = {
      user: {
        id: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        email: "user@example.com",
        name: "Test User",
      },
      url: "https://app.wraps.dev/reset-password?token=test-token",
      token: "test-token",
    };

    await emailAndPassword.sendResetPassword?.(params);

    expect(getWrapsClientMock).toHaveBeenCalledTimes(1);
    expect(sendTemplateMock).toHaveBeenCalledWith({
      from: process.env.AUTH_EMAIL_FROM,
      to: "user@example.com",
      template: "password-reset",
      configurationSetName: process.env.AUTH_EMAIL_CONFIGURATION_SET,
      templateData: {
        privacyUrl: "https://wraps.dev/privacy",
        resetPasswordUrl:
          "https://app.wraps.dev/reset-password?token=test-token",
        name: "Test User",
        email: "user@example.com",
      },
    });
  });

  it("sends password changed emails using AUTH_EMAIL_FROM and AUTH_EMAIL_CONFIGURATION_SET", async () => {
    const params: OnPasswordResetParams = {
      user: {
        id: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        email: "user@example.com",
        name: "Test User",
      },
    };

    await emailAndPassword.onPasswordReset?.(params);

    expect(getWrapsClientMock).toHaveBeenCalledTimes(1);
    expect(sendTemplateMock).toHaveBeenCalledWith({
      from: process.env.AUTH_EMAIL_FROM,
      to: "user@example.com",
      template: "password-changed",
      configurationSetName: process.env.AUTH_EMAIL_CONFIGURATION_SET,
      templateData: {
        name: "Test User",
        email: "user@example.com",
      },
    });
  });
});
