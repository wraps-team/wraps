import { ClosingCtaView } from "./closing-cta-view";
import { ClosingPanel } from "./closing-panel";
import { CTAButtons } from "./cta-buttons";

/** The homepage's closing section: the shared ink panel with the tracked CTA buttons. */
export function CTASection() {
  return (
    <ClosingCtaView>
      <ClosingPanel
        actions={<CTAButtons />}
        body="Start free. Nothing already in your account is touched, and the infrastructure is yours if you ever leave."
        id="get-started"
        title="Your email, on your own AWS, in about two minutes."
      />
    </ClosingCtaView>
  );
}
