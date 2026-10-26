export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json">{JSON.stringify(data)}</script>; // baseline:allow-no-sync-scripts — JSON-LD is data, never executes
}
