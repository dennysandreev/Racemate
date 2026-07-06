# Security Manual Tests

Use two real test users: `user_a` and `user_b`. Do not use production personal accounts unless necessary. Run against staging or a launch-test Supabase project first.

## 1. Supabase RLS / Two-user Isolation

- [ ] Sign in as `user_a`; complete onboarding.
- [ ] Sign in as `user_b`; complete onboarding.
- [ ] As `user_a`, create favorites, a prediction, a private league, a poll vote, and an article reaction.
- [ ] As `user_b`, attempt to read `user_a` profile via Supabase client/API using `user_a` id. Expected: no row.
- [ ] As `user_b`, attempt to update `user_a` profile/favorites/prediction. Expected: no update.
- [ ] As anonymous user, attempt to read `profiles`, `user_favorite_teams`, `user_favorite_drivers`, `predictions`, `poll_votes`, `admin_users`, `job_runs`, `ai_usage_logs`. Expected: no private/admin rows.
- [ ] As `user_b`, join only public/shared league flows. Expected: cannot read private league details unless a member.
- [ ] As `user_a`, invite `user_b` to a league; after join, `user_b` can see allowed league/member/prediction summary only.

## 2. Public Read Boundaries

- [ ] Confirm `news_articles` returns only `status = processed` and `duplicate_of is null`.
- [ ] Confirm draft digests are hidden and published digests are visible.
- [ ] Confirm hidden `grand_prix_reports` are not public.
- [ ] Confirm `race_replay_sessions` only exposes ready sessions.
- [ ] Confirm public prediction share route returns only `is_public = true` rows by `share_slug`.

## 3. Auth Failure Cases

- [ ] Request login link for an existing email and a non-existing email. Expected: user-facing response stays generic.
- [ ] Repeatedly request OTP for the same email and IP. Expected: throttled by Supabase/dashboard or edge limiter.
- [ ] In production with Turnstile keys configured, submit login without a valid Turnstile token. Expected: generic failure and no OTP email.
- [ ] Open an already-used or expired email link. Expected: graceful redirect, no stack trace, no provider error leak.
- [ ] Sign out, then open `/account`, `/fantasy`, `/leagues`, `/polls` write flows. Expected: redirected to auth or action blocked server-side.
- [ ] Inspect auth cookies in production browser devtools. Expected: Secure, HttpOnly where applicable, SameSite appropriate.

## 4. Server Actions And Forms

- [ ] Submit predictions with invalid driver/team ids. Expected: rejected/generic message.
- [ ] Submit duplicate or oversized top-10 prediction. Expected: rejected.
- [ ] Try saving after lock windows. Expected: locked fields are preserved/rejected as designed.
- [ ] Try league join with random codes repeatedly. Expected: rate limit or no useful enumeration.
- [ ] Try poll vote twice. Expected: unique constraint/generic duplicate state.
- [ ] As non-admin, call admin actions manually. Expected: redirect/block.

## 5. Headers, CORS, And Browser Checks

- [ ] Fetch production `/` headers. Expected: CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy.
- [ ] Confirm no route returns `Access-Control-Allow-Origin: *` for sensitive endpoints.
- [ ] Open core pages after CSP header change: `/`, `/auth`, `/fantasy`, `/news`, `/calendar`, `/admin` as admin.
- [ ] Check browser console for CSP violations that break functionality.

## 6. Secrets And Deployment

- [ ] Confirm `.env.local` and production `.env` are not in Git.
- [ ] Confirm Docker image does not contain `.env` or local secrets.
- [ ] Confirm frontend bundle does not include `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `SUPABASE_ACCESS_TOKEN`, SMTP secrets, or database URLs.
- [ ] If any secret was ever committed or exposed, regenerate immediately and invalidate the old key.

## 7. Billing And Cost

- [ ] Trigger worker jobs from admin and confirm only admins can do so.
- [ ] Confirm OpenRouter caps stop processing when exceeded.
- [ ] Confirm dashboard alerts fire at 50%, 80%, and 100% spend thresholds.
