import Loader from "@/components/loader";

/**
 * Loading state for the public group.
 *
 * `(public)` serves unsubscribe and preference-centre pages reached from
 * email links; its layout is synchronous, so this fallback appears *inside*
 * that layout's frame. Deliberately not passed the full-viewport prop: the
 * root loader this replaced took over the whole screen, which is why a
 * redirect chain flashed a bare spinner at every hop.
 */
export default function PublicLoading() {
  return <Loader />;
}
