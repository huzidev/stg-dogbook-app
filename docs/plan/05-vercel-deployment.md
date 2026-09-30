# 05 — Vercel deployment (first target)

## Runtime choice
React Router 7 app → deploy as a **Vercel Node.js server** (not static, not edge). We need long-lived Prisma connections and the Shopify session storage layer — both incompatible with the Edge runtime.

## Vercel preset for React Router
`@react-router/dev` supports Vercel via the `@vercel/react-router` preset. Add it and register in `react-router.config.js` (create if missing):

```js
// react-router.config.js
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  presets: [vercelPreset()],
};
```

Install:
```
npm i -D @vercel/react-router
```

Vercel auto-detects React Router 7 projects with this preset and configures the serverless function output — no custom `vercel.json` needed for the app itself.

## Postgres on Vercel
Vercel-hosted app + external Postgres. Options in order of laziness:
1. **Neon** (recommended) — serverless Postgres, free tier, works with Prisma out of the box. `DATABASE_URL` from Neon dashboard.
2. **Vercel Postgres (Neon-backed)** — same thing, integrated in the Vercel dashboard.
3. **Supabase Postgres** — fine, an extra dashboard to manage.
4. **Self-hosted** — don't.

Prisma + serverless: use the pooled connection string (`?pgbouncer=true&connection_limit=1`) for serverless functions, and the direct connection for migrations (`DIRECT_URL`). Neon exposes both. `schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")       // pooled — for the app
  directUrl = env("DIRECT_URL")         // direct — for migrations
}
```

## Env vars to set in Vercel
```
DATABASE_URL=<pooled Neon URL>
DIRECT_URL=<direct Neon URL>
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SHOPIFY_APP_URL=https://<your-vercel-domain>
SCOPES=<from shopify.app.toml>
SHOPIFY_SHOP_DOMAIN=thedogbook.myshopify.com
ALLOWED_STOREFRONT_ORIGINS=https://cornerbookstore.com,https://www.cornerbookstore.com
```

`SHOPIFY_APP_URL` must match the Vercel deployment URL — update `shopify.app.toml`'s `application_url` and redeploy the Shopify config (`npm run deploy`) after the first Vercel deploy.

## Build & install commands
- Install: `npm install` (default)
- Build: `npm run build` (default, runs `react-router build`)
- Output: handled by `@vercel/react-router` preset — no override.

## Migrations on deploy
Prisma migrations should run **before** the app starts. On Vercel there's no "before start" hook for serverless — two lazy options:
1. **Run migrations locally / from CI**, deploy after. Command: `DATABASE_URL=<direct URL> npx prisma migrate deploy`. Add a GitHub Action or just do it by hand for now.
2. **Run in `postinstall`** — `"postinstall": "prisma generate && prisma migrate deploy"`. Works but every preview deploy tries to migrate.

Default: **option 1**, run migrations manually against the Neon direct URL when the schema changes. Simpler, avoids preview-deploy surprises.

## Shopify app URL update
After the first Vercel deploy:
1. Copy the deployment URL (or set a custom domain).
2. Update `shopify.app.toml` → `application_url` and `redirect_urls`.
3. `npm run deploy` to push the updated Shopify config.

## Skipped, add when
- Vercel cron for cleanup jobs — skip, add when we have stale rows worth deleting.
- Custom domain — skip, add when you're ready to point DNS.
- Sentry / logging integration — skip, add when we hit a bug we can't reproduce.
