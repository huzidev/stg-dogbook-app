# 06 — Heroku deployment (later)

## Why later, not now
Vercel-first is fine to ship. Heroku becomes relevant if we need:
- Always-warm workers (webhook processing, cron) that don't fit serverless.
- A single long-running Node process instead of per-request serverless functions.
- Heroku Postgres as the DB of record instead of Neon.

Nothing in the current feature set requires it. Plan below is minimal so we can move fast when the time comes.

## Buildpack
Heroku auto-detects Node from `package.json`. Node engine already pinned there (`>=20.19 <22 || >=22.12`) — Heroku will honor it.

## Start command
Existing `start` script already works: `"start": "react-router-serve ./build/server/index.js"`.

`Procfile` at repo root:
```
web: npm run start
release: npx prisma migrate deploy
```

The `release` phase runs migrations on every deploy, before the new dyno takes traffic. This is the piece Vercel is awkward about — on Heroku it's built in.

## Postgres
```
heroku addons:create heroku-postgresql:essential-0
```
Heroku sets `DATABASE_URL` automatically. No `DIRECT_URL` needed — Heroku Postgres is a normal Postgres connection, not pooled/serverless.

`schema.prisma` on Heroku:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
(Same file as Vercel — `directUrl` is ignored if not present, so one schema serves both.)

## Env vars
Same set as `05-vercel-deployment.md`, minus `DIRECT_URL`. Set with `heroku config:set KEY=value`.

## Shopify app URL update
Same drill as Vercel: update `shopify.app.toml` → `application_url` to the Heroku URL, run `npm run deploy`.

## Existing Dockerfile
Repo already has a `Dockerfile`. If we prefer container deploy on Heroku (`heroku container:push web`), it works — but the buildpack path is less code and simpler. Default to buildpack unless there's a reason.

## Skipped, add when
- Redis add-on for background jobs — skip, add when webhooks need durable queueing.
- Multi-dyno scale — skip, add when we see load.
- Heroku Scheduler — skip, add when we have periodic tasks.
