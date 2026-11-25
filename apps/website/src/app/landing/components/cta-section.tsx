import { ClosingCtaView } from "./closing-cta-view";
import { ClosingPanel } from "./closing-panel";
import { CTAButtons } from "./cta-buttons";

/** The homepage's closing section: the shared ink panel with the tracked CTA buttons. */
export function CTASection() {
  return (
    <ClosingCtaView>
      <ClosingPanel
        actions={<CTAButtons />}
        body="Connect your AWS account and add your domain. Send test emails while AWS reviews your account."
        id="get-started"
        title="Own your email."
      />
    </ClosingCtaView>
  );
}
