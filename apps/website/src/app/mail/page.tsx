import { Mail } from "@/app/mail/components/mail";
import { accounts, mails } from "@/app/mail/data";
import { BaseLayout } from "@/components/layouts/base-layout";

export default function MailPage() {
  return (
    <BaseLayout description="Manage your email conversations" title="Mail">
      <div className="flex h-full flex-col">
        <Mail
          accounts={accounts}
          defaultCollapsed={false}
          defaultLayout={[20, 32, 48]}
          mails={mails}
          navCollapsedSize={4}
        />
      </div>
    </BaseLayout>
  );
}
