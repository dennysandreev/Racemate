# Dashboard Security Checklist

## Supabase

- [ ] Confirm project region: `[NEEDS CONFIRMATION: Supabase region]`
- [ ] Confirm RLS is enabled on every exposed `public` table.
- [ ] Confirm policies match `supabase/migrations`.
- [ ] Run Supabase security advisors.
- [ ] Confirm anon key has no access beyond intended public reads.
- [ ] Confirm service role key is only in server/worker env.
- [ ] Confirm Storage policies for `news-images` and `driver-avatars`.
- [ ] Confirm Auth email OTP errors do not enumerate accounts.
- [ ] Confirm strict Auth rate limits for OTP, verify, token refresh, and email sends.
- [ ] Confirm SMTP provider is configured for production.
- [ ] Confirm email templates do not include secrets or unsafe redirect URLs.

## Billing caps

- [ ] Set hard daily/monthly cap for OpenRouter/OpenAI/Anthropic if used.
- [ ] Set alert at 50% usage.
- [ ] Set alert at 80% usage.
- [ ] Set alert at 100% usage.
- [ ] Confirm Supabase spend limits.
- [ ] Confirm Vercel/VPS spend limits.
- [ ] Confirm email provider limits.

## API keys

- [ ] Regenerate any exposed key.
- [ ] Remove exposed key from Git history if needed.
- [ ] Move secret keys to server-side env vars.
- [ ] Move Supabase service role key to server-only environment.
- [ ] Confirm OpenRouter key is worker/server only.
- [ ] Confirm SMTP password and Supabase access token are never logged.

## Hosting / Reverse proxy

- [ ] Confirm production domain(s): `racemate.ru`, optional `www.racemate.ru`.
- [ ] Confirm TLS is valid and redirects HTTP to HTTPS.
- [ ] Confirm reverse proxy does not add permissive CORS.
- [ ] Confirm production headers are present after deploy.
- [ ] Confirm access logs do not store sensitive query params longer than necessary.
- [ ] Confirm `.env` files are not copied into public/static assets or the final image.

## Cloudflare Turnstile

- [ ] Create a Turnstile site key for `racemate.ru`.
- [ ] Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in production web env.
- [ ] Set `TURNSTILE_SECRET_KEY` in production server env.
- [ ] Confirm `/auth` renders the challenge in production.
- [ ] Confirm OTP request fails when a Turnstile token is missing/invalid.

## Monitoring

- [ ] Alert on worker failures.
- [ ] Alert on repeated auth failures/OTP requests.
- [ ] Alert on unusual public API volume.
- [ ] Alert on OpenRouter usage spikes.
- [ ] Define secret rotation owner/process.
