import { HeroFlow } from "./hero-flow";

/*
 * What the headline means, in motion: see hero-flow.tsx. The figure carries the
 * description; the animation itself is hidden from assistive tech.
 */
export function HeroProductPanel() {
  return (
    <figure className="hero-rise relative m-0 mx-auto w-full max-w-2xl">
      {/* Warm light behind the figure; the one place the hero uses the brand colour as atmosphere. */}
      <div
        aria-hidden="true"
        className="-top-4 absolute inset-x-12 h-40 rounded-full bg-brand/15 blur-3xl"
      />
      <div className="relative">
        <HeroFlow />
      </div>
      <figcaption className="sr-only">
        One command deploys the sending stack into your AWS account. A broadcast
        sent from the Wraps dashboard then produces sent, delivered, opened and
        clicked events in a table in that same account.
      </figcaption>
    </figure>
  );
}
