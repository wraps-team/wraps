import Loader from "@/components/loader";

/**
 * Loading state for the auth group.
 *
 * `(auth)/layout.tsx` is synchronous and renders a centred card frame, so this
 * fallback appears *inside* that frame — the logo and card chrome stay on
 * screen. Deliberately not passed the full-viewport prop: the root loader
 * this replaced took over the whole screen, which is why a redirect chain
 * through /auth flashed a bare spinner at every hop.
 */
export default function AuthLoading() {
  return <Loader />;
}
