"use client";

import { CodeTabs } from "@/components/ui/shadcn-io/code-tabs";

const DEPLOY = "npx @wraps.dev/cli sms init";

const SEND = `import { WrapsSMS } from "@wraps.dev/sms";

const sms = new WrapsSMS();

// Skip numbers that texted STOP
if (!(await sms.optOuts.check("+14155551234"))) {
  await sms.send({
    to: "+14155551234",
    message: "Your code is 123456",
  });
}`;

/** The deploy command and one SDK call, each in its own shared code block. */
export function SmsCode() {
  return (
    <div className="grid gap-4">
      <CodeTabs codes={{ Deploy: DEPLOY }} lang="bash" variant="flush" />
      <CodeTabs codes={{ "send.ts": SEND }} lang="typescript" variant="flush" />
    </div>
  );
}
