# RaceMate Security Audit

Audit date: 2026-06-30  
Scope: local repository audit for RaceMate MVP launch baseline. Secrets are intentionally masked and not printed.

## 1. Project Inventory

| Area | Finding |
|---|---|
| Frontend | Next.js App Router, React, TypeScript, Tailwind CSS, shadcn-style local primitives |
| Backend | Next.js route handlers and server actions |
| Worker | Node worker in `worker/index.mjs`; optional Python/FastF1 helper |
| Database | Supabase Postgres with SQL migrations in `supabase/migrations` |
| Auth provider | Supabase Auth email OTP/passwordless |
| Storage | Supabase Storage buckets for news images and driver avatars |
| Deploy target | Docker standalone Next.js app plus worker/cron services; known production domain `racemate.ru` |
| Public domains | `racemate.ru`, `www.racemate.ru` if DNS/reverse proxy enables it, localhost for development |
| Env storage | `.env.local` for local secrets, `.env.example` for contract, `.env` in Docker compose runtime |
| Paid services | Supabase, OpenRouter, hosting/VPS; Resend/SMTP possible for auth mail |
| Free/external data | Jolpica, OpenF1, Open-Meteo, RSS sources, RSSHub/X, Reddit RSS, Jina reader, Polymarket gamma API |
| Sensitive zones | Auth cookies, profiles, favorites, predictions, leagues, polls/votes, admin actions, service role client, worker API keys, storage policies |
| Dashboard-only items | Supabase project region, Supabase Auth rate limits, SMTP provider settings, spend caps, Vercel/VPS region, OpenRouter billing alerts |

Primary entry points:
- Server actions: `src/app/auth/actions.ts`, `src/app/onboarding/actions.ts`, `src/app/fantasy/actions.ts`, `src/app/predictions/actions.ts`, `src/app/leagues/actions.ts`, `src/app/polls/actions.ts`, `src/app/news/actions.ts`, `src/app/admin/actions.ts`
- API routes: `src/app/api/**/route.ts`
- Database/RLS: `supabase/migrations/*.sql`
- Server-only clients: `src/lib/supabase/server.ts`, `src/lib/auth.ts`
- Worker integrations: `worker/index.mjs`

## 2. Legal and Privacy Baseline

| Item | Status | Notes |
|---|---|---|
| Privacy policy | Missing | Created `PRIVACY_POLICY_DRAFT.md` |
| Terms of use | Missing | Add before public launch if predictions/leagues/polls are public-facing |
| Cookie notice | Needs decision | Supabase Auth cookies are used; no analytics/tracking found |
| User data collected | Present | Email, display name, timezone, favorite teams/drivers, predictions, league membership, poll votes, article reactions |
| Potential personal data | Present | Email, display name, favorites, predictions, votes, auth/session data |
| Data storage region | Needs dashboard confirmation | Supabase and hosting/VPS regions are not determinable from code |
| Third parties receiving data | Present | Supabase receives user/auth data; OpenRouter receives article/report/poll context from worker, not user secrets; SMTP provider may receive email addresses |
| Suspicious practices | Not found in code | No plain-text passwords, no user data sent to personal email, no analytics/tracking found |

Risk: launch blocker until privacy policy is reviewed and regions/providers are confirmed.

## 3. Database and RLS Audit

All `public.*` tables created in migrations have `enable row level security`. This was verified by parsing migrations locally. Live Supabase state still needs dashboard/SQL confirmation.

| Table | RLS enabled | SELECT policy | INSERT policy | UPDATE policy | DELETE policy | Risk | Required fix |
|---|---:|---:|---:|---:|---:|---|---|
| admin_users | Yes | Admin | Admin | Admin | Admin | Low | Confirm live policy state |
| ai_usage_logs | Yes | Admin | Service/admin only | Service/admin only | Service/admin only | Medium | Confirm no anon/auth public read |
| article_reactions | Yes | Own via all | Own via all | Own via all | Own via all | Low | Add two-user RLS test |
| circuit_driver_stats | Yes | Public | Admin | Admin | Admin | Low | Intentional public reference data |
| circuit_grand_prix_history | Yes | Public | Admin | Admin | Admin | Low | Intentional public reference data |
| circuit_layouts | Yes | Public | Admin | Admin | Admin | Low | Intentional public reference data |
| circuit_stats | Yes | Public | Admin | Admin | Admin | Low | Intentional public reference data |
| circuit_team_stats | Yes | Public | Admin | Admin | Admin | Low | Intentional public reference data |
| circuit_weather | Yes | Public | Admin | Admin | Admin | Low | Intentional public race data |
| circuits | Yes | Public | None | None | None | Low | Intentional public reference data |
| constructor_standings | Yes | Public | None | None | None | Low | Intentional public sports data |
| digests | Yes | Published only | None | None | None | Low | Confirm drafts are hidden |
| driver_standings | Yes | Public | None | None | None | Low | Intentional public sports data |
| drivers | Yes | Active only | None | None | None | Low | Intentional public reference data |
| grand_prix_reports | Yes | Visible only | Admin | Admin | Admin | Low | Confirm hidden reports are blocked |
| job_runs | Yes | Admin | Admin | Admin | Admin | Medium | Confirm no public operational leak |
| news_article_tags | Yes | Public | None | None | None | Low | Intentional public metadata |
| news_articles | Yes | Processed only | Admin | Admin | Admin | Medium | Confirm pending/raw payload not public |
| news_sources | Yes | Active only | Admin | Admin | Admin | Medium | Confirm inactive/internal sources hidden |
| poll_options | Yes | Visible published/closed | None | None | None | Low | Intentional public poll data |
| poll_votes | Yes | Own vote | Open poll only | None | None | Medium | Add two-user vote privacy test |
| polls | Yes | Published/closed | None | None | None | Low | Intentional public poll data |
| prediction_league_members | Yes | Own/member/public league | Self join | None | None | Medium | Add two-user league privacy test |
| prediction_leagues | Yes | Public/owner/member | Owner only | Owner only | None | Medium | Add private league IDOR test |
| predictions | Yes | Own/shared league | Own | Own | Own | Medium | Add private prediction IDOR test |
| profiles | Yes | Own | Own | Own | None | Medium | Add profile isolation test |
| race_replay_events | Yes | Ready session events | Admin | Admin | Admin | Low | Intentional public replay data |
| race_replay_sessions | Yes | Ready only | Admin | Admin | Admin | Low | Confirm non-ready sessions hidden |
| races | Yes | Public | None | None | None | Low | Intentional public sports data |
| seasons | Yes | Public | None | None | None | Low | Intentional public sports data |
| session_results | Yes | Public | None | None | None | Low | Intentional public sports data |
| session_weather | Yes | Public | Admin | Admin | Admin | Low | Intentional public race data |
| sessions | Yes | Public | None | None | None | Low | Intentional public sports data |
| social_posts | Yes | Public | Admin | Admin | Admin | Low | Intentional public social feed |
| social_sources | Yes | Admin | Admin | Admin | Admin | Medium | Confirm no public source management |
| tags | Yes | Public | Admin | Admin | Admin | Low | Intentional public metadata |
| teams | Yes | Active only | None | None | None | Low | Intentional public reference data |
| track_maps | Yes | Public | Admin | Admin | Admin | Low | Intentional public replay data |
| user_favorite_drivers | Yes | Own | Own | Own | Own | Medium | Add two-user favorites test |
| user_favorite_teams | Yes | Own | Own | Own | Own | Medium | Add two-user favorites test |

Notes:
- Helper functions `is_admin`, `is_league_member`, and `shares_prediction_league` are `security definer`; later migrations revoke public/anon execute and grant helper access only where needed.
- Some app code uses `createSupabaseAdminClient()` after an explicit user/admin/membership check. This is acceptable as server-side bypass, but manual IDOR tests are required.

## 4. Server-side Validation Audit

| Endpoint/Form/Action | Server-side validation | Auth check | Ownership check | Sanitization | Risk | Fix |
|---|---:|---:|---:|---:|---|---|
| `signInWithEmail` | Good | N/A | N/A | Email trim/lowercase, Turnstile when configured | Low | Confirm Supabase dashboard limits |
| `saveOnboarding` | Good | Yes | Yes | Display name length and timezone allowlist | Low | Validate team/driver IDs live via RLS/manual test |
| `saveFantasyPrediction` | Good | Yes | Yes | ID normalization | Low | In-memory rate limit added |
| `savePrediction` | Good | Yes | Yes | ID normalization | Low | In-memory rate limit added |
| `createFantasyLeague` / `createLeague` | Good | Yes | Yes | Name length, crypto invite code | Low | In-memory rate limit added |
| `joinFantasyLeague` / `joinLeague` | Good | Yes | Self join | Code normalize/length | Low | In-memory rate limit added |
| `reactToArticle` | Good | Yes | Yes | Enum allowlist | Low | In-memory rate limit added |
| `votePoll` | Good | Yes | Yes | Existence/status checks | Low | In-memory rate limit added |
| `admin triggerJob` | Good | Admin | Admin | Job allowlist | Medium | In-memory rate limit added; add persistent audit log later |
| `admin manual X post` | Good | Admin | Admin | HTTPS/X host allowlist, length limits | Low | Confirm admin-only flow manually |
| `admin report/driver/avatar actions` | Good | Admin | Admin | File type/size for avatars | Low | Confirm storage policies live |
| Public GET API routes | Good for type bounds | Public | N/A | Numeric/platform normalization | Low | In-memory IP rate limits added |

No SQL injection pattern was found; Supabase query builder is used instead of string SQL in request handlers/actions.

## 5. Error Handling and Data Leakage

| Area | Status | Notes |
|---|---|---|
| User-facing action errors | Mostly safe | Redirects use generic query messages, no raw database errors surfaced |
| API route errors | Mostly safe | Public API returns short Russian messages; no stack traces in route handlers |
| Worker errors | Mixed | Worker throws/logs provider/status details server-side; should ensure logs are not public and redact provider payloads consistently |
| Health endpoint | Acceptable | Reveals configured/healthy status only; no secrets |
| Auth email query | Fixed | Check-email route no longer receives email in the URL |

Fixed in this audit:
- Added production security headers in `next.config.ts`.
- Added in-memory rate limits for OTP requests, write actions, admin job triggers, and public API/image routes.
- Added optional Cloudflare Turnstile verification for the email OTP form.
- Removed email from the check-email URL.

Required:
- Keep production logs private and rotate/redact worker logs.

## 6. Auth Failure-case Audit

RaceMate uses passwordless Supabase email OTP; password lockout tests are not applicable.

| Case | Status | Notes |
|---|---|---|
| Login with existing/non-existing email | Needs manual confirmation | Supabase Auth dashboard behavior and SMTP responses must not enumerate accounts |
| Repeated OTP requests | Partially fixed | App-level per-IP/per-email limits added; Supabase dashboard limits still need confirmation |
| Repeated verification/callback link | Needs manual test | Callback ignores missing/invalid code and redirects generically |
| Signup with existing email | N/A/Needs confirmation | OTP flow should stay generic |
| Logout | Implemented | Calls `supabase.auth.signOut()` and redirects |
| Protected routes | Mostly server-side | Sensitive pages/actions use `requireUser`/`requireAdmin`; `proxy.ts` protected route list is empty |
| Cookie settings | Supabase-managed | Needs browser/dashboard confirmation in production |

## 7. Security Headers

Fixed:
- Added `Content-Security-Policy`
- Added `Strict-Transport-Security`
- Added `X-Content-Type-Options: nosniff`
- Added `X-Frame-Options: DENY`
- Added `Referrer-Policy`
- Added `Permissions-Policy`

Residual risk:
- CSP currently allows `'unsafe-inline'` for scripts/styles because the app has inline theme initialization and Next.js App Router may emit inline runtime/data scripts. Turnstile script/frame is explicitly allowed. Move to nonce/hash-based CSP after browser validation.
- `images.remotePatterns` allows any HTTPS hostname. This supports external news/social images but should be narrowed or proxied before launch.

## 8. OWASP Top 10 Review

| OWASP Category | Status | Evidence | Risk | Fix |
|---|---|---|---|---|
| A01 Broken Access Control | Needs manual confirmation | RLS present; actions use auth checks | Medium | Run two-user RLS/IDOR tests |
| A02 Cryptographic Failures | Mostly pass | No passwords stored; Supabase Auth | Low | Confirm HTTPS/HSTS in production |
| A03 Injection | Mostly pass | Query builder; no raw request SQL | Low | Keep validating admin URLs and text lengths |
| A04 Insecure Design | Partially fixed | App-level in-memory limits and optional Turnstile added | Medium | Use Redis/edge limiter for multi-instance production |
| A05 Security Misconfiguration | Partially fixed | Headers added; dashboard unknown | Medium | Confirm CORS/Auth/Storage/API exposure in dashboards |
| A06 Vulnerable Components | Pass local audit | `pnpm audit --audit-level high` clean | Low | Re-run before release |
| A07 Identification/Auth Failures | Needs work | OTP rates dashboard-dependent | High | Configure strict Supabase auth limits and generic copy |
| A08 Software/Data Integrity | Mostly pass | Lockfile committed; Docker build from lockfile | Low | Avoid `latest` dependencies before launch if reproducibility matters |
| A09 Logging/Monitoring Failures | Needs work | Worker logs exist; no alerting found | Medium | Add alerts for auth, AI spend, worker failures |
| A10 SSRF | Needs review | Worker fetches admin-configured RSS/URLs; image optimizer allows any HTTPS host | Medium | Restrict/proxy remote fetch targets |

## 9. Credential and Sensitive Data Leak Audit

| Check | Result |
|---|---|
| `.env.local` tracked by Git | No |
| `.env.example` tracked | Yes, contains empty placeholders and public project ref only |
| Local secret values printed | No |
| Secret scanner | `gitleaks`/`trufflehog` not installed |
| Pattern scan in working files | No committed-looking OpenRouter/Supabase/Resend/SMTP secrets found |
| Git history for env files | Only `.env.example` history found |

Local `.env.local` contains configured values for public Supabase URL/anon key, OpenRouter key, and Supabase service role key. Values were not printed. Required: confirm `.env.local` remains ignored and never copied into Docker image or Git.

## 10. API Key Exposure Audit

| Env var / Key | Classification | Current location | Safe? | Required change |
|---|---|---|---:|---|
| `NEXT_PUBLIC_APP_URL` | Public | Frontend/server | Yes | Confirm prod URL |
| `NEXT_PUBLIC_SITE_URL` | Public | Frontend/server | Yes | Confirm prod URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Frontend/server | Yes | OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Frontend/server | Yes | OK if RLS is correct |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Server/worker/admin client | Yes | Confirm absent from frontend env |
| `SUPABASE_ACCESS_TOKEN` | Secret | SMTP config script | Yes | Keep stdin/env only; never log |
| `RESEND_API_KEY` | Secret | Env contract only | Needs confirmation | Configure server-side only if used |
| `SMTP_PASS` | Secret | SMTP config script | Yes | Do not print in logs |
| `OPENROUTER_API_KEY` | Secret | Worker only | Yes | Confirm no browser calls |
| `OPENROUTER_SITE_URL` | Public-ish | Worker header | Yes | OK |
| `REDIS_URL` | Secret | Env contract | Needs confirmation | Use server-only if rate limiter added |
| `FASTF1_*` | Server config | Worker/Docker | Yes | OK |

## 11. Rate Limits and Cost Protection

| Endpoint | Paid API / DB cost | Current rate limit | Recommended limit | Implemented? |
|---|---|---|---|---:|
| Supabase OTP login | Email/Auth | App per-IP/per-email; dashboard unknown | Strict per IP/email | Partial |
| Server actions writing predictions/leagues/polls/reactions | DB write | In-memory per-user | Per user/IP, persistent/shared in prod | Partial |
| Public GET API routes | DB read | In-memory per-IP | ~100/min/IP with cache | Partial |
| Admin job trigger actions | Worker/AI/API cost | Admin-only + in-memory per-admin | Per admin/IP + audit log | Partial |
| Worker OpenRouter calls | Paid API | Batch caps via env | Daily/monthly caps + dashboard alerts | Partial |
| Worker RSS/OpenF1/Jolpica/Open-Meteo | External/API cost | Batch env limits/timeouts | Provider-aware throttling | Partial |

P1 follow-up: replace or supplement in-memory limits with Redis/edge/reverse-proxy limits before multi-instance production.

## 12. CAPTCHA and Bot Protection

| Public form / endpoint | CAPTCHA/Bot protection | Risk | Required fix |
|---|---:|---|---|
| Email sign-in form | Optional Turnstile + rate limit | OTP/email abuse if keys are not configured | Configure Turnstile keys in production |
| Invite/join league | Rate limit | Invite code enumeration | Consider challenge after repeated failures |
| Poll voting | Auth required + rate limit | Automated vote abuse from signed-in accounts | Consider stronger shared limiter |
| Article reactions | Auth required + rate limit | Spam reactions | Consider stronger shared limiter |
| Admin forms | Admin required | Low | No CAPTCHA needed; add audit log |
| Unauthenticated POST endpoints | None found | Low | Keep this invariant |

## 13. CORS Audit

No custom CORS headers or `Access-Control-Allow-Origin: *` were found in app route handlers. Same-origin Next.js defaults apply.

Required:
- Confirm reverse proxy/Vercel does not add wildcard CORS for sensitive routes.
- If adding cross-origin APIs later, allow only production/staging/local origins explicitly.

## 14. Dependency and Security Scanner Results

| Check | Command | Result |
|---|---|---|
| Lint | `corepack pnpm lint` | Pass |
| Typecheck | `corepack pnpm typecheck` | Pass |
| Fantasy smoke test | `corepack pnpm test:fantasy-scoring` | Pass |
| Package audit | `corepack pnpm audit --audit-level high` | Pass, no known vulnerabilities |
| Secret scanner | `which gitleaks`, `which trufflehog` | Not installed |
| Build | `corepack pnpm build` | Pass |

Additional dependency note: `package.json` uses several `latest` dependency ranges. That is not a direct vulnerability, but before public launch pin exact versions for reproducible deploys.
