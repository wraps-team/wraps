import { getWrapsClient } from "../lib/client";

export type SendVerificationEmailParams = {
  to: string;
  url: string;
  name?: string;
};

export async function sendVerificationEmail({
  to,
  url,
  name,
}: SendVerificationEmailParams) {
  const wraps = await getWrapsClient();

  return wraps.sendTemplate({
    from: process.env.AUTH_EMAIL_FROM as string,
    to,
    template: "email-verification",
    configurationSetName: process.env.AUTH_EMAIL_CONFIGURATION_SET,
    templateData: {
      name: name || "",
      verificationUrl: url,
    },
  });
}
