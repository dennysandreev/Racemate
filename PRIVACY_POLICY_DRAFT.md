# Privacy Policy Draft

This is a launch draft for RaceMate. It must be reviewed before publication.

Last updated: 2026-06-30

## What RaceMate collects

RaceMate may collect:

- email address used for passwordless sign-in;
- display name;
- timezone;
- favorite Formula 1 teams and drivers;
- predictions, league membership, scores, poll votes, and article reactions;
- basic auth/session data handled by Supabase;
- operational logs needed to keep the service reliable.

RaceMate does not store passwords in the application database. Authentication is handled through Supabase email OTP/passwordless login.

## How data is used

RaceMate uses this data to:

- sign users in;
- show personal F1 favorites and prediction flows;
- calculate leaderboards and league results;
- prevent abuse and troubleshoot service issues;
- improve race calendar, news, replay, and prediction features.

## Public information

Some information can become public inside RaceMate:

- public prediction share pages when a user creates/shares them;
- display names and scores in leaderboards or leagues where the user participates;
- poll totals and article reaction counts.

Private profile data, favorites, private league membership, and non-public predictions should remain protected by access rules.

## Third-party services

RaceMate uses or may use:

- Supabase for authentication, database, and storage;
- an SMTP/email provider such as Resend/Postmark/SendGrid for login emails;
- Cloudflare Turnstile for bot protection on public forms, if enabled in production;
- OpenRouter for server-side AI processing of news, reports, digests, and polls;
- external motorsport/data sources such as Jolpica, OpenF1, Open-Meteo, RSS sources, RSSHub/X, Reddit RSS, Jina reader, and Polymarket data endpoints;
- hosting/VPS infrastructure for serving the app.

RaceMate should not send private user secrets to AI providers. Worker AI prompts should use article/report/race context, not passwords or secret keys.

## Cookies and sessions

RaceMate uses authentication cookies/session storage managed by Supabase to keep users signed in. No analytics or advertising tracking code was found in the repository during this audit.

## Data storage region

[NEEDS CONFIRMATION: hosting/database region]

Confirm and publish:

- Supabase project region;
- hosting/VPS region;
- email provider region or data processing terms;
- OpenRouter/provider data handling terms.

## Data sharing

RaceMate does not sell user data. Data is shared with third-party processors only where needed to provide the service, authenticate users, send emails, host the app, store data, or process race/news content.

## Security

RaceMate uses Supabase Row Level Security policies, server-side validation, and server-only secret keys. Public launch requires completion of the security launch gate.

## User choices

Users should be able to:

- sign out;
- update profile/favorite settings;
- request deletion of their account/data through the support contact once support process is defined.

## Contact

[NEEDS CONFIRMATION: privacy/support contact email]

## Before publishing

- [ ] Legal review completed.
- [ ] Regions confirmed.
- [ ] Support/privacy contact added.
- [ ] Retention/deletion process documented.
- [ ] Terms of Use created if needed.
