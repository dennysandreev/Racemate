# Security Fix Plan

## P0 / Blocker

- No confirmed P0 vulnerability was found in local code.
- BLOCKER until manually confirmed: live Supabase schema/RLS matches migrations and no secret key has ever been exposed in Git, frontend env, logs, or deployment artifacts.

## P1 / High

1. Configure strict Supabase Auth limits.
   - Current repo defaults in `.env.example` are permissive (`AUTH_RATE_LIMIT_* = 10000`).
   - Confirm actual production values in Supabase dashboard.
   - Keep OTP/login errors generic.

2. Replace in-memory rate limits with shared production limits when needed.
   - Implemented now: auth email submit, prediction saves, league create/join, poll vote, article reaction, public GET APIs, image routes, and admin job triggers.
   - Remaining production hardening: edge/reverse-proxy or Redis/Upstash-style limiter for multi-instance deployments.

3. Run two-user RLS/IDOR tests against the live project.
   - Verify profiles, favorites, predictions, private leagues, poll votes, hidden reports, draft digests/articles.
   - Use `SECURITY_MANUAL_TESTS.md`.

4. Configure Cloudflare Turnstile for email OTP request flow.
   - Code support is implemented with `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
   - Remaining: create keys in Cloudflare dashboard and set production env vars.

5. Review worker/admin cost protection.
   - Admin can queue worker jobs that may call external APIs.
   - Admin job trigger rate limit is implemented.
   - Remaining: add persistent admin action audit logging.
   - Confirm OpenRouter hard caps and alerts.

## P2 / Medium

1. Add persistent/shared rate limiting.
   - Current app-level limiter is in-memory and per process.
   - Use Redis/edge/reverse proxy for production with more than one web instance.

2. Tighten CSP.

3. Narrow Next image remote host policy.
   - `images.remotePatterns` currently allows any HTTPS host.
   - Either proxy/cache approved images or allowlist actual source domains.

4. Add production monitoring and log redaction checklist.
   - Worker errors should not expose provider payloads, full URLs with tokens, or user data.

5. Pin dependency versions instead of `latest`.
   - Keep lockfile, but exact ranges reduce surprise upgrades.

## P3 / Low

1. Add final Terms of Use if leagues/polls/predictions are public.
2. Add cookie notice if legal review decides auth cookies require explicit notice.
3. Document incident response: secret rotation, Supabase key regeneration, log retention.
4. Add automated security tests once a local Supabase test environment is available.

## Already Fixed In This Audit

- Added baseline security headers in `next.config.ts`.
- Added in-memory rate limits for auth, write actions, admin job triggers, and public API/image routes.
- Added optional Cloudflare Turnstile verification for email OTP.
- Removed email from check-email URL.
- Replaced league invite/share suffix randomness with Node crypto.
- Added length/enum validation for onboarding, league names, admin social/report fields.
- Created audit, manual test, dashboard checklist, privacy draft, and launch gate documents.
