# Local dev URLs

`pnpm dev` serves every app through `portless` (a global CLI) on HTTPS hostnames, not
ports, so `localhost:3000` is not listening. Check local work at these:

| App | Local dev URL | Production |
|---|---|---|
| Dashboard (`apps/web`) | `https://web.wraps.localhost` | `https://app.wraps.dev` |
| Marketing site (`apps/website`) | `https://website.wraps.localhost` | `https://wraps.dev` |
| API (`apps/api`) | `https://api.wraps.localhost` | `https://api.wraps.dev` |

Run the CLI against them with `pnpm cli:dev`. Plain `pnpm cli` uses the CLI's own
defaults (`http://localhost:3001` / `:3000`), which portless leaves unserved.
