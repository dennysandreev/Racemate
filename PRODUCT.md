# Product

## Register

product

## Users

RaceMate is for Russian-speaking Formula 1 fans who want one place to follow the season without jumping between feeds, tables, calendars, and chats. They may open it quickly before a session, read the latest stories during the day, check standings after a race, or submit predictions with friends before a weekend starts.

Core user groups:
- Casual fans who need clear news, calendar, standings, and race context.
- Engaged fans who follow drivers, teams, race weekends, and post-session results.
- Competitive fans who want predictions, mini-leagues, polls, reactions, and leaderboards.
- Admin/editor users who manage sources, ingestion, AI processing, jobs, and data quality.

## Product Purpose

RaceMate is a premium motorsport companion for the F1 season. It combines cached official and third-party F1 data, RSS/API news ingestion, Russian AI summaries, race weekend context, favorites, predictions, leagues, polls, reactions, and an operational admin surface.

Success means a user can:
- understand what matters in F1 today in under a minute;
- see what happens next in the season or current race weekend;
- follow favorite drivers and teams;
- make and compare predictions without friction;
- trust that news, standings, schedules, and results are sourced and current.

## Brand Personality

Fast, sharp, and composed.

RaceMate should feel like a serious sport product, not a meme page or a generic dashboard. It can be energetic, but the energy should come from timing, contrast, data, motorsport texture, and confident hierarchy rather than noisy decoration.

Voice:
- Russian-first, concise, human, and editorial.
- No internal/system wording in UI.
- No dry admin-style labels for users.
- Buttons use direct actions like "Сохранить", "Сделать прогноз", "Создать лигу".

## Anti-references

RaceMate must not look like:
- a generic dark SaaS dashboard with purple gradients;
- an overloaded racing game HUD;
- a crypto/fintech leaderboard clone;
- a plain news blog with no product interaction;
- a F1 trademark imitation or unofficial copy of Formula 1 branding.

Avoid these patterns:
- glassmorphism as default;
- identical icon-card grids;
- huge decorative gradients with no product meaning;
- tiny uppercase eyebrows on every section;
- UI copy that sounds like database fields, API states, or technical specs.

## Design Principles

1. Put the next useful racing moment first: the current weekend, next session, latest result, or strongest story should be easy to find.
2. Make news feel sourced and calm: summarize, tag, dedupe, and link out instead of pretending to be the original publisher.
3. Keep competition legible: predictions, leagues, and leaderboards should be exciting but never confusing.
4. Use density with discipline: motorsport data can be rich, but scanning must stay fast on mobile.
5. Design admin surfaces as operational tools: quiet, dense, and reliable, with clear job states and recovery actions.

## Accessibility & Inclusion

Target WCAG 2.2 AA for core public and authenticated flows.

Required:
- keyboard-visible focus states;
- readable contrast for body, muted, placeholder, and table text;
- responsive support for 375px, 768px, 1024px, and 1440px widths;
- reduced-motion alternatives for all animation;
- color-independent status communication;
- touch targets appropriate for mobile;
- clear empty, loading, error, and stale-data states.

## Scope Defaults

Included in V1:
- public news, AI summaries, digests, calendar, race hub, results, standings, teams, drivers, circuits;
- email OTP/passwordless auth;
- onboarding, favorites, personal feed;
- predictions, mini-leagues, leaderboards, polls, reactions;
- operational admin for sources, jobs, articles, AI usage, and sync tasks;
- worker-based external API ingestion and caching.

Deferred from V1:
- Telegram integration;
- web push and other notification delivery;
- notification preferences;
- live timing and live telemetry;
- YouTube/video;
- native mobile apps.
