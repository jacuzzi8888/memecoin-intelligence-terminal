# Security Model

## Trust Boundaries

```
┌───────────────────────────────────────────────────┐
│ UNTRUSTED                                          │
│ Browser, Telegram, External APIs                   │
├───────────────────────────────────────────────────┤
│ BOUNDARY: Input Validation (Zod), Rate Limiting    │
├───────────────────────────────────────────────────┤
│ SEMI-TRUSTED                                       │
│ API Server, Background Workers                     │
├───────────────────────────────────────────────────┤
│ BOUNDARY: Auth, Authorization, Encrypted Storage   │
├───────────────────────────────────────────────────┤
│ TRUSTED                                            │
│ Database, Redis, Provider Credentials              │
└───────────────────────────────────────────────────┘
```

## Core Security Rules

### 1. Private Keys
- **NEVER** stored in database
- **NEVER** stored in application memory longer than transaction signing
- **NEVER** logged or included in error reports
- **NEVER** transmitted to server (client-side signing only)
- User wallets connect via Solana Wallet Adapter (browser-side signing)

### 2. Secrets Management
- API keys stored in environment variables only
- No secrets in source code, logs, or error messages
- Secrets never passed to browser/client
- Development secrets are clearly marked and non-production

### 3. Input Validation
- All external inputs validated with Zod schemas
- SQL injection prevented by Drizzle ORM (parameterized queries)
- XSS prevented by React's default escaping
- CSRF protected by Auth.js token validation

### 4. Authentication
- Auth.js with provider-neutral design
- Session tokens stored in HTTP-only cookies
- CSRF protection on all state-changing operations
- Rate limiting on authentication endpoints

### 5. Authorization
- Users can only access their own data
- API endpoints check ownership before returning data
- Admin operations require elevated privileges
- Development-only features disabled in production

### 6. Rate Limiting
- Per-IP rate limiting on public endpoints
- Per-user rate limiting on authenticated endpoints
- Expensive operations (scoring, ingestion) have lower limits
- Rate limit headers returned in responses

### 7. Data Protection
- Sensitive data encrypted at rest (future)
- PII minimized (only necessary data collected)
- Data retention policies enforced
- Audit logging for security-sensitive operations

## Security-Sensitive Decisions

| Decision | Risk | Mitigation |
|----------|------|------------|
| Non-custodial trading | Low (user controls keys) | Clear UX around signing |
| Storing wallet addresses | Medium (public but linked) | No balance/position exposure without auth |
| Telegram integration | Medium (chat ID exposure) | Linking requires user action |
| Provider API keys | High (financial access) | Environment variables only |
| Development auth mode | High (if leaked to prod) | Feature flag + environment check |

## Vulnerability Response

1. **Discovery**: Report via secure channel (not public issues)
2. **Assessment**: Evaluate severity and impact
3. **Fix**: Implement fix in private branch
4. **Deploy**: Deploy fix to production
5. **Disclose**: Inform affected users if data was compromised
6. **Review**: Post-mortem and prevention measures

## Security Checklist

- [ ] No secrets in source code
- [ ] No private keys in database
- [ ] All inputs validated with Zod
- [ ] Rate limiting on expensive endpoints
- [ ] Auth checks on all protected routes
- [ ] CORS configured correctly
- [ ] HTTPS enforced in production
- [ ] Security headers configured
- [ ] Development features disabled in production
- [ ] Error messages don't leak internals
