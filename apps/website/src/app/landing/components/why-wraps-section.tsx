import Image from "next/image";
import Link from "next/link";

export function WhyWrapsSection() {
  return (
    <section className="relative overflow-hidden py-20 md:py-24" id="why-wraps">
      {/* Grain texture — ties back to hero */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]"
      >
        <filter id="why-noise">
          <feTurbulence
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
            type="fractalNoise"
          />
        </filter>
        <rect filter="url(#why-noise)" height="100%" width="100%" />
      </svg>

      {/* Large W motif — background watermark */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 top-1/2 h-[500px] w-[500px] -translate-y-1/2 text-foreground opacity-[0.03] md:h-[700px] md:w-[700px] lg:-right-10 lg:h-[800px] lg:w-[800px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        viewBox="0 0 330 299"
      >
        <path d="M276.7 6.4c-9.2-4.2-13.9-5.9-14.2-5.1-.2.7-3.5 16.3-7.4 34.7s-11.7 55.8-17.5 83-13.4 63.2-17 80-9.7 45.4-13.5 63.7c-3.9 18.3-7.1 33.7-7.1 34.3 0 .7 10.4 1 31.3 1 17.1 0 32.2-.3 33.4-.6 1.7-.5 2.4-1.8 3.3-6.3.7-3.1 5.9-28.1 11.6-55.6 5.8-27.5 17.9-85.2 27-128.1 9-43 16.4-78.6 16.4-79.1 0-.4-7.3-4.2-16.2-8.2-9-4.1-22.5-10.3-30.1-13.7M34.2 42.2C6.4 42 1 42.2 1 43.4c0 .7 2.5 12.8 5.5 26.7 3 14 10.2 48.1 16 75.9s15.1 72 20.7 98.4c6.9 32.4 10.5 47.3 11 46 .5-1.1 5.6-21.3 11.4-44.9 5.8-23.7 13.5-55.3 17.2-70.4l6.6-27.3-3.2-15.7c-1.8-8.6-6.8-32.3-11.1-52.6l-7.7-37zM162 42c-18.1 0-33 .4-33 .9s8.3 34.8 18.5 76.2c10.2 41.5 23.8 96.3 30.1 121.9 6.4 25.6 12.1 47.8 12.8 49.3 1 2.5 1.9-.7 7.9-29 3.8-17.5 10.2-47.6 14.3-66.8 4.2-19.3 8-37.7 8.6-41 1-5.9.8-7.1-11.6-56.5-6.9-27.8-13.1-51.5-13.6-52.8l-1-2.2zm-39.5 12.1c-.3-.2-.7.2-.9 1-.3.8-5.5 21.6-11.6 46.4-6.1 24.7-17.4 70.6-25.1 102s-16 65.1-18.4 75-4.1 18.3-3.8 18.7c.2.5 15 .8 32.7.8 24.7 0 32.6-.3 33.4-1.3.5-.6 5.6-20.1 11.2-43.2s11.5-47.1 13-53.4l2.9-11.4-16.5-67.1c-9.1-36.9-16.7-67.2-16.9-67.5" />
      </svg>

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 md:grid-cols-[1fr_auto] md:gap-16 lg:gap-24">
          {/* Left column — narrative */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">
              Why Wraps
            </p>

            <div className="mt-6 space-y-4">
              <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
                I spent years at SendGrid watching companies pay hundreds a
                month to send emails through infrastructure they didn&rsquo;t
                own. When they change pricing or get acquired, your sending
                history, reputation, and templates go with them.
              </p>

              <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
                <Link
                  className="text-foreground underline underline-offset-2 hover:text-orange-500 transition-colors"
                  href="/alternatives"
                >
                  Postmark charges per email. Resend charges per email.
                  Mailchimp charges per contact.
                </Link>{" "}
                None of them deploy to your AWS account. You&rsquo;re always
                renting.
              </p>
            </div>

            {/* Turning point */}
            <div className="my-8 h-px w-20 bg-orange-500" />

            <p
              className="text-5xl uppercase leading-[0.85] tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-[5.5rem]"
              style={{ fontFamily: '"League Gothic Condensed", sans-serif' }}
            >
              So I built <span className="text-orange-500">Wraps.</span>
            </p>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-foreground/80 md:text-xl">
              Deploy to your AWS and use the{" "}
              <Link
                className="text-foreground underline underline-offset-2 hover:text-orange-500 transition-colors"
                href="/platform"
              >
                platform
              </Link>{" "}
              when you need to send broadcasts, manage templates with a team, or
              create automations.
            </p>
          </div>

          {/* Right column — founder photo */}
          <div className="flex flex-col items-center">
            <Image
              alt="Jarod, founder of Wraps"
              className="rounded-full"
              height={140}
              src="/team/jarod-medium-smile.webp"
              width={140}
            />
            <p className="mt-4 font-semibold text-foreground">Jarod</p>
            <p className="text-sm text-muted-foreground">Founder, Wraps</p>
          </div>
        </div>
      </div>
    </section>
  );
}
