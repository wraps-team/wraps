import { SectionKicker } from "./section-kicker";

type Tile = {
  index: string;
  title: string;
  meta?: string;
  /** Clip base name; the -light twin and both posters derive from it. */
  clip: string;
  span: "wide" | "tall" | "sm";
};

/*
 * Each clip is rendered at its slot's exact size (wraps-private, src/lib/
 * bento.ts mirrors the numbers below), so object-cover has nothing to crop.
 * Change a span or the row height here and those compositions have to be
 * re-rendered to match, or the content starts getting cut off again.
 */

const tiles: Tile[] = [
  {
    index: "01",
    title: "One-command deploy",
    meta: "SES, DynamoDB, Lambda in one command",
    clip: "DeployCli",
    span: "wide",
  },
  {
    index: "02",
    title: "Broadcasts",
    meta: "compose once, send to thousands",
    clip: "BroadcastSend",
    span: "wide",
  },
  {
    index: "03",
    title: "Audience segments",
    clip: "ContactSegment",
    span: "tall",
  },
  {
    index: "04",
    title: "Templates as code",
    clip: "TemplateEdit",
    span: "sm",
  },
  {
    index: "05",
    title: "Workflows",
    clip: "WorkflowConnect",
    span: "sm",
  },
  {
    index: "06",
    title: "Live analytics",
    clip: "MetricsCountUp",
    span: "sm",
  },
  {
    index: "07",
    title: "Every send, tracked",
    clip: "StatusBadgeFlow",
    span: "sm",
  },
];

const spanClass: Record<Tile["span"], string> = {
  wide: "md:col-span-3 md:row-span-2",
  tall: "md:col-span-2 md:row-span-2",
  sm: "md:col-span-2",
};

/*
 * Below md every tile stacks full-width, so the grid's row height no longer
 * sets the slot — the tile carries its clip's own ratio instead. From md the
 * rows take over and this goes back to filling the cell.
 */
const ratioClass: Record<Tile["span"], string> = {
  wide: "aspect-[535/404]",
  tall: "aspect-[351/404]",
  sm: "aspect-[351/194]",
};

/*
 * Both themes ship as separate clips and swap on the site's `.dark` class, the
 * same way the product tabs swap their screenshots.
 *
 * The still is a CSS background rather than the `poster` attribute: a poster is
 * fetched even when the video is display:none, so the hidden twin was pulling a
 * second set of JPEGs for a theme nobody was looking at. A background-image on
 * a display:none element is never fetched, and it paints in exactly the same
 * place — the video is transparent until its first frame lands. The clip body
 * itself stays put too, since Chrome won't autoplay an invisible video.
 *
 * `preload="none"` would be tighter still, but it suppresses autoplay outright.
 */
function TileVideo({
  clip,
  theme,
  title,
}: {
  clip: string;
  theme: "light" | "dark";
  title: string;
}) {
  const suffix = theme === "light" ? "-light" : "";

  return (
    <video
      autoPlay
      className={
        theme === "light"
          ? "absolute inset-0 size-full object-cover dark:hidden"
          : "absolute inset-0 hidden size-full object-cover dark:block"
      }
      loop
      muted
      playsInline
      preload="metadata"
      src={`/landing/${clip}${suffix}.mp4`}
      style={{
        backgroundImage: `url(/landing/posters/${clip}${suffix}.jpg)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <track kind="descriptions" label={title} />
    </video>
  );
}

export function ProductShowcaseSection() {
  return (
    <section className="border-border border-b py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionKicker>Product tour</SectionKicker>
        <h2 className="mb-8 max-w-[24ch] font-heading font-semibold text-[30px] text-foreground leading-[1.08] tracking-[-0.022em] md:text-[40px]">
          Everything that happens after you hit send.
        </h2>

        {/*
         * The row height tracks the container instead of sitting at a fixed
         * 196px. With a fixed row the grid narrows below max-w-6xl while the
         * height stays put, so every tile slowly crops sideways — a third of
         * the width at the md breakpoint. Solving for a constant slot ratio:
         *
         *   col       = (W - 5*14) / 6           six columns, 14px gaps
         *   sm track  = 2*col + 14               tiles 04-07
         *   row       = (sm track - 2) * 194/351 + 2   less the 1px borders
         *             = 0.184236*W - 4.264
         *
         * which lands on ~196px at the full 1088px, matching what it was.
         */}
        <div className="@container">
          <div className="grid grid-cols-2 gap-3.5 md:auto-rows-[calc(18.4236cqw-4.264px)] md:grid-cols-6">
            {tiles.map((tile) => (
              <div
                className={`relative col-span-2 overflow-hidden rounded-lg border border-border bg-background ${ratioClass[tile.span]} md:aspect-auto ${spanClass[tile.span]}`}
                key={tile.index}
              >
                <TileVideo clip={tile.clip} theme="light" title={tile.title} />
                <TileVideo clip={tile.clip} theme="dark" title={tile.title} />
                {/*
                 * The label floats on the clip instead of taking a bar of its
                 * own, so the video fills the tile edge to edge. The scrim fades
                 * in from transparent well above the text; the compositions keep
                 * real content out of the bottom strip (lib/bento.ts LABEL_SAFE)
                 * so nothing readable ends up underneath it.
                 */}
                <div className="absolute inset-x-0 bottom-0 flex items-baseline gap-2 bg-gradient-to-t from-background/95 via-background/80 to-transparent px-3.5 pt-6 pb-2.5">
                  <span className="font-mono text-[11px] text-orange-500">
                    {tile.index}
                  </span>
                  <span className="font-medium text-[13px] text-foreground">
                    {tile.title}
                    {/* Wraps onto a second line on a stacked tile, which eats
                      into the clip's safe area — one line or nothing. */}
                    {tile.meta ? (
                      <small className="ml-1.5 hidden font-normal text-[11px] text-muted-foreground md:inline">
                        {tile.meta}
                      </small>
                    ) : null}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
