# Security Model

## Scope

The current product is a personal intelligence app without account sign-in. It is not a multi-user SaaS. Public market intelligence can be read without a session, while state changes and sensitive configuration are protected by a personal write key.

## Current Access Rules

- `GET /health`, status, scanner, token, dashboard, and research data remain readable.
- Every `POST`, `PUT`, `PATCH`, and `DELETE` request requires either `x-aegis-write-key` or a valid signed API bearer token when `API_WRITE_TOKEN` is configured.
- Settings and notification-destination reads also require the personal key because they may contain private routing details.
- Production with `PERSONAL_APP_MODE=true` refuses to start without an `API_WRITE_TOKEN` of at least 32 characters.
- The browser key is entered manually in Settings and stored in that browser's local storage. It is sent only in a request header over HTTPS and is never compiled into the frontend.
- CORS must be restricted to the deployed frontend origin.
- Expensive scan, wallet-discovery, and strategy-replay routes have stricter rate limits.

## Trust Boundaries

```text
Untrusted browser and providers
        |
        | HTTPS, CORS, write key, rate limit, Zod validation
        v
Fastify API and background workers
        |
        | parameterized Drizzle queries, queue job contracts
        v
PostgreSQL, Redis, and provider credentials
```

## Secret Rules

- Provider keys, Telegram tokens, webhook credentials, database URLs, Redis URLs, signing secrets, and the personal write key belong in deployment environment variables only.
- No secret may use a `NEXT_PUBLIC_` prefix.
- No wallet private key or seed phrase may be stored, logged, or sent to the API.
- Final Phase 3 must use browser-side wallet signing and explicit transaction review.
- Rotate any credential that has been pasted into chat, logs, screenshots, or committed files.

## Browser-Key Limitations

- Local storage is appropriate for this single-user personal boundary, but any successful same-origin script injection could read it.
- Strong Content Security Policy, dependency review, React escaping, and avoiding third-party scripts reduce that risk.
- Locking changes in Settings removes the key from that browser.
- A public multi-user release would require real identity, per-user authorization, and server-side sessions. That is outside the current personal-app scope.

## Data and Authorization

- Public Solana wallet and token addresses are not secrets, but watchlist notes, notification destinations, and operator preferences should be treated as private.
- Development user fallback is allowed only in development/test or explicit personal mode.
- Development ingestion routes remain unavailable in production.
- Trading stays disabled until the final security review and Phase 3 gate.

## Operational Checklist

- [x] Inputs validated with Zod on primary API surfaces
- [x] Parameterized database access through Drizzle
- [x] Global and expensive-route rate limiting
- [x] Fail-closed production personal write key
- [x] Sensitive settings reads protected
- [x] No frontend-bundled API write secret
- [x] Container runs as non-root
- [x] Development ingestion disabled in production
- [ ] Set and rotate production `API_WRITE_TOKEN`
- [ ] Restrict production `CORS_ORIGIN` to the exact Vercel domain
- [x] Add CSP, anti-framing, referrer, MIME, and permissions headers in the web configuration
- [ ] Verify security headers on the deployed frontend
- [ ] Verify HTTPS on frontend and API custom domains
- [ ] Run dependency and secret scanning in CI
- [ ] Complete a final Phase 3 wallet/signing threat model
