# Vercel Deployment

Vercel hosts the Next.js surface in `apps/web`. The Fastify API and indexer are
long-running services and must be deployed separately so live scans, wallet
synchronization, and transaction processing remain available continuously.

## Deployment order

1. Provision production PostgreSQL and Redis.
2. Deploy `apps/api` as a persistent Node service.
3. Deploy `services/indexer` as a persistent worker using the same production
   database and Redis.
4. Apply database migrations from a trusted environment.
5. Deploy this repository to Vercel with the production API URL.

## Vercel project settings

- Root directory: repository root
- Framework preset: Next.js
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @memecoin/web build`
- Environment variable: `NEXT_PUBLIC_API_URL=https://<public-api-domain>`

Set `NEXT_PUBLIC_APP_URL` and `CORS_ORIGIN` on the API to the final Vercel
domain before using the browser client. Do not expose database, Redis, provider,
or trading credentials as `NEXT_PUBLIC_*` variables.

## Production gates

Use a unique `NEXTAUTH_SECRET`, set `NODE_ENV=production`, keep development
auth and development ingestion disabled, and leave live trading disabled until
the evidence gates and manual review requirements are satisfied.

For personal mode, set `PERSONAL_APP_MODE=true` and a unique `API_WRITE_TOKEN`
on Railway. Do not set the write key on Vercel. Enter it manually in the
deployed app under **Settings -> Personal Write Access**.

The Vercel deployment is not complete until the deployed web surface can reach
the API health endpoint and the API can read the production database.

## Railway runtime

The repository includes a shared `Dockerfile` for the API and indexer. Set
`SERVICE_ROLE=api` on the API service and `SERVICE_ROLE=indexer` on the worker
service. Both services should use the same production `DATABASE_URL` and
`REDIS_URL`, but only the API service needs a public domain.

Set `INDEXER_EMBED_PROCESSOR=true` and `INDEXER_EMBED_ALERTS=true` when one
Railway worker is used for the personal deployment. Use
`DISCOVERY_SCHEDULE_MS=15000` and `DISCOVERY_MAX_EVENTS=150` for the current
freshness target.
