import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  findSubscriptionById,
  MARKETPLACE_SESSION_COOKIE,
  type RegistrationError,
} from "@/lib/marketplace/aws";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

// The (public) layout already sets robots: "noindex, nofollow".
export const metadata: Metadata = {
  title: "Set up your Wraps subscription",
};

/**
 * Buyers land here after subscribing on AWS Marketplace. The POST handler at
 * /api/marketplace/aws resolves their licence and drops the row id on an
 * httpOnly cookie before redirecting; this page reads that cookie.
 */

const ERROR_COPY: Record<RegistrationError, string> = {
  invalid_request:
    "AWS sent a registration request we could not read. Try Set up your account again from AWS Marketplace.",
  missing_token:
    "This page is reached from AWS Marketplace. Open your subscription there and choose Set up your account.",
  expired_token:
    "That registration link had already expired. Open your subscription in AWS Marketplace and choose Set up your account again.",
  invalid_token:
    "AWS rejected that registration link. Open your subscription in AWS Marketplace and choose Set up your account again.",
  listing_unavailable:
    "This listing is not accepting registrations yet. If you reached this from AWS Marketplace, let us know at support@wraps.dev.",
  try_again:
    "AWS is rate limiting us right now. Wait a moment and choose Set up your account again.",
  resolve_failed:
    "We could not confirm your subscription with AWS. Try again, and email support@wraps.dev if it keeps happening.",
  resolve_incomplete:
    "AWS confirmed your subscription but did not return a licence we can use. Email support@wraps.dev and we'll sort it out.",
  persist_failed:
    "We confirmed your subscription but failed to save it. Email support@wraps.dev and we'll sort it out.",
};

function isRegistrationError(value: string): value is RegistrationError {
  // Object.hasOwn, not `in` — `in` walks the prototype chain, so ?error=constructor
  // would pass this guard and hand the page a function to render.
  return Object.hasOwn(ERROR_COPY, value);
}

export default async function MarketplaceRegisterPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await props.searchParams;

  const cookieStore = await cookies();
  const ref = cookieStore.get(MARKETPLACE_SESSION_COOKIE)?.value;
  const subscription = ref ? await findSubscriptionById(ref) : null;

  // An error only blocks when there is no usable licence behind it. If a
  // previous visit already resolved one, the form still works — show the error
  // as a notice above it rather than stranding a buyer who has a way forward.
  const notice = error && isRegistrationError(error) ? ERROR_COPY[error] : null;
  const blocked = !subscription;
  const blockingMessage = blocked ? (notice ?? ERROR_COPY.missing_token) : null;

  return (
    // The (public) layout already renders <main> and a fixed footer, so this is
    // a plain div at a bounded height rather than a second landmark at 100vh.
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="font-semibold text-2xl text-foreground tracking-tight">
        Set up your Wraps subscription
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Wraps deploys email infrastructure into your own AWS account. You keep
        the infrastructure and pay AWS directly for what it uses — those charges
        are separate from this subscription.
      </p>

      <div className="mt-8 space-y-4">
        {blockingMessage ? (
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-foreground text-sm">{blockingMessage}</p>
          </div>
        ) : (
          <>
            {notice ? (
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-foreground text-sm">{notice}</p>
              </div>
            ) : null}
            <RegisterForm />
          </>
        )}
      </div>

      <p className="mt-8 text-muted-foreground text-xs">
        Questions? <a href="mailto:support@wraps.dev">support@wraps.dev</a>
      </p>
    </div>
  );
}
