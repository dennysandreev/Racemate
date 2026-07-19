# Design

## Product

RaceMate is a product UI for a premium Formula 1 companion: public fan surfaces, authenticated prediction workflows, and operational admin. The default visual register is product, with occasional brand-led moments on the public home and race weekend pages.

## Stitch Source Of Truth

The current visual source of truth is the Google Stitch project `RaceMate Premium UI System`, design system `Apex Performance`.

Canonical screen mapping:
- `/` — `RaceMate Dashboard`
- `/weekend` — `RaceMate Austrian GP Weekend`
- `/news` — `RaceMate News Hub`
- `/news/[slug]` — `RaceMate Article Detail`
- `/calendar` — `RaceMate Season Calendar`
- `/calendar/[season]/[round]` and report popup — Barcelona GP results/report screens
- `/leaderboard` — `RaceMate Championship Leaderboard Only`
- `/teams`, `/drivers/[slug]`, and `/teams/[lineageSlug]` — season-aware sporting profiles
- `/fantasy` — `RaceMate Fantasy League`
- `/social` — `RaceMate Social Networks Feed`
- `/polls` — `RaceMate Polls`
- `/auth` and `/auth/check-email` — `RaceMate Auth Flow`
- `/onboarding` — `RaceMate Onboarding`
- `/admin` — `RaceMate Admin Operations`

Implementation rule: static Stitch HTML is a visual specification, not production code. Production code must keep RaceMate's Next.js App Router, Server Components by default, existing repositories/actions, and Russian product copy.

## Design Direction

Reading this as: a motorsport product for engaged Russian-speaking F1 fans, with a premium sport-app language, leaning toward Stitch's dark `Apex Performance` cockpit system: obsidian surfaces, Ferrari red active states, neon-green live status, sharp editorial hierarchy, dense race-control modules, shadcn/ui primitives, and custom RaceMate tokens.

Scene sentence: a fan opens RaceMate on a phone or laptop in the hour before a race session, wants the key story, the next start time, and their prediction status immediately, and should feel the product is fast, current, and composed.

Design dials:
- Design variance: 7/10.
- Motion intensity: 5/10.
- Visual density: 8/10 for app/admin surfaces, 6/10 for public editorial pages.

## Color System

Use semantic tokens in CSS based on the Stitch Apex Performance palette. Avoid purple gradients, beige/cream defaults, and one-note slate-only dark mode.

Strategy:
- Base: Obsidian Base `#0B0B0B`.
- Surface: Obsidian Elevated `#121212`, Obsidian Surface `#1E1E1E`, and hairline glass stroke `rgba(255,255,255,0.08)`.
- Primary accent: Ferrari/F1 red `#E10600` for primary actions, active nav, current race/session emphasis.
- Secondary accent: Live neon `#39FF14` for live/available states only.
- Tertiary accent: timing amber for upcoming sessions, warnings, and lock windows.
- Team colors appear only as contextual accents, never as the global palette.

Starter tokens:

```css
:root {
  --background: oklch(0.145 0.012 250);
  --foreground: oklch(0.965 0.006 245);
  --surface: oklch(0.19 0.014 250);
  --surface-raised: oklch(0.235 0.016 250);
  --surface-muted: oklch(0.285 0.015 250);
  --border: oklch(0.36 0.018 250);
  --muted: oklch(0.74 0.018 250);
  --primary: oklch(0.62 0.22 27);
  --primary-foreground: oklch(0.985 0.005 40);
  --success: oklch(0.70 0.19 150);
  --warning: oklch(0.78 0.16 78);
  --danger: oklch(0.61 0.22 27);
  --info: oklch(0.68 0.12 222);
}
```

Contrast requirements:
- Body text on background and surfaces: at least 4.5:1.
- Muted text must remain readable and should not fall into decorative gray.
- Status colors must be paired with text, icons, or labels.

## Typography

Use `next/font`; do not link Google Fonts with raw `<link>` tags or CSS `@import`.

Recommended stack:
- UI and display: Geist Sans in production, tuned to match Stitch's Hanken Grotesk proportions.
- Timing, codes, session labels, and technical metadata: Geist Mono.

Stitch references may mention Hanken Grotesk, Inter, and JetBrains Mono. In this repo, use `geist` via `next/font` unless a local font file is added explicitly. Avoid serif as the default product font; RaceMate should feel sharp and modern, not magazine-vintage.

Type rules:
- H1/H2 use balanced wrapping.
- Body copy max width: 65-75ch.
- Dense UI headings stay compact; reserve hero scale for true public hero moments.
- Product UI uses a fixed rem scale rather than viewport-driven font scaling.
- Letter spacing stays at 0 for most UI; display tightening must not go below `-0.04em`.

## Layout

Public surfaces:
- Use a strong cockpit first viewport: current race context, next session, weather/session strip, track module, and one high-signal right rail.
- News and race hub pages can use asymmetric layouts, but must collapse cleanly to a single-column mobile view.
- Avoid a generic landing page unless explicitly needed; the app experience should be visible immediately.

App surfaces:
- Favor dense but organized panels, tables, segmented controls, tabs, filters, and side/top navigation.
- Desktop uses the Stitch shell: fixed top navigation plus left command sidebar. Mobile collapses to a burger/drawer.
- Cards are for repeated content, modals, and framed tools. Do not nest cards.
- Fixed-format UI such as prediction picks, standings rows, and session cards must have stable dimensions to avoid layout jumps.

Historical season surfaces:
- Calendar, championship, teams, driver profiles, and team-lineage profiles keep the selected year only in their own `?season=YYYY`; championship mode keeps `table=constructors` as well. Main navigation opens the current season and never propagates an archive year.
- `SeasonSwitcher` sits under the surface title or profile metadata. On desktop it is collapsed by default, keeps the active year visible, and reveals the other published years horizontally on demand; it expands right by default and left in the team profile hero. On mobile it becomes a compact native select and never expands the page horizontally. The control uses a 44px interaction height, visible focus, keyboard-native behavior, 150-200ms feedback, and no transition under reduced motion.
- A profile with one available season shows a quiet static season label instead of a disabled control.
- Historical pages use the same Apex Performance hierarchy as the current season, but only show sporting information. Current-only news, social posts, odds, weather, AI race reports, and Race Replay do not appear.
- Historical calendar maps always use the same muted grayscale treatment as completed races in the current season; the active current-season race remains the only full-color state.
- Cars, logos, and maps must resolve from the selected season and remain part of its publication gate. Never substitute 2026 artwork for a historical asset.
- Historical driver portraits are optional. When a season-specific portrait is absent, show a composed number or initials placeholder with the team's seasonal color, without loading or review-status copy. Existing 2026 portraits remain unchanged.

Admin surfaces:
- Quiet, high-density operational layout.
- Tables, filters, job status badges, retry actions, and audit metadata are more important than visual drama.

## Components

Use shadcn/ui as the component foundation after project scaffolding.

Expected components:
- Button, Badge, Card, Table, Tabs, Dialog, Sheet, Drawer, Tooltip, Popover, Select, Input, Textarea, Checkbox, Switch, ToggleGroup, Command, Skeleton, Empty, Alert, Toast/Sonner, Chart.

Rules:
- Use semantic tokens rather than raw Tailwind color values.
- Use icons in tool buttons and action buttons where they improve scanning.
- Use familiar controls: segmented controls for modes, toggles for binary settings, sliders/inputs for numeric values, tabs for views, menus for option sets.
- Dialogs and sheets always need accessible titles.
- Forms should use clear product copy and validation states.

Icon direction:
- Use one icon family per project.
- Prefer a precise lightweight family when available.
- Do not hand-roll SVG icons for common actions.

## Motion

Motion should imply speed and state change without becoming a racing-game HUD.

Use:
- 150-250ms hover, focus, selection, loading, and control feedback;
- transform and opacity for animation;
- subtle timing/ticker motion only where it represents real product state.

Avoid:
- orchestrated page-load sequences for task surfaces;
- bounce/elastic motion;
- scroll effects that hide content until JS runs;
- animating layout properties;
- heavy blur on scrolling containers.

Every motion pattern needs a `prefers-reduced-motion` alternative.

## Content Design

UI language is Russian by default.

Write like a product designer speaking to an F1 fan:
- "Сделать прогноз" instead of "Создание прогноза".
- "Любимые команды" instead of "Список избранных команд".
- "Нет свежих новостей" instead of "Данные отсутствуют".
- "Попробовать еще раз" instead of "Повторить запрос".

Avoid:
- field-name language;
- internal statuses as user copy;
- API terminology;
- formal bureaucratic wording;
- placeholders that repeat labels.

Admin copy can be more operational, but still human and direct.

## Required Quality Checks

Before shipping any meaningful UI:
- run lint, typecheck, tests, and build when available;
- inspect desktop and mobile with Browser or Playwright;
- verify no text overflows on 375px width;
- verify keyboard focus and reduced motion;
- check contrast for body, muted, placeholder, status, and table text;
- test empty, loading, error, and stale-data states.
