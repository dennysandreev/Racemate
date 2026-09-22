# Design

## Telemetry workspace

The setup-only introduction matches the News header's 160px desktop height at 1024px and up, with the same 184px minimum below that breakpoint. The open comparison header keeps its content-based height. Setup modes use one compact segmented control with sentence-case Geist labels, small icons on desktop and a raised active segment; icons hide on mobile to preserve readable labels without scrolling. The comparison views reuse the same segmented surface, typography and raised active state. Their wider row switches to the existing compact select below 900px so every view stays available without clipped labels or horizontal scrolling.

Telemetry traces use each driver's OpenF1 team color consistently in charts, labels, track segments and exported cards. Every trace is a solid line. Comparisons within one team or between two laps of one driver use the team color for the first trace and a neutral gray for the second; other comparisons keep both team colors. Missing team colors use a neutral fallback.

Race telemetry adds «Средний темп гонки» beside the regular lap choices. The resulting trace is one distance-normalized average of every comparable clean lap for that driver; pit-in laps, their following pit-out laps, deleted or incomplete laps, and laps affected by yellow, red, safety-car or virtual-safety-car periods are excluded. The summary states how many laps formed the average and omits tyre/compound context because the profile may span several stints.

While an existing comparison is edited, loading a new session catalog stays inside the settings dialog and keeps the current workspace visible. The full loading panel appears only for the submitted comparison. Whole-lap analysis labels braking distance as the combined path travelled with the brake pressed beyond the threshold, omits neutral gear 0, and uses bold weight for the stronger comparable value; braking positions remain unranked.

`/telemetry` uses a fixed viewport with the standard RaceSide navigation and no site footer, as requested on 12 September 2026. Charts fill the available height. Comparison controls open in a dialog after the first comparison; whole-lap analysis lives in its own tab. Mobile uses a view selector. Only long detail panels and dialogs scroll internally. Circuit outlines use the horizontal plane of the existing models with equal scaling on both axes.

Telemetry keeps the standard full RaceSide sidebar, mobile header, Geist typography, semantic colors, PageTitle and Button components. The navigation item follows Current Weekend. Setup is a compact session strip followed by two driver/lap selections with trace accents, using three user-facing scenarios: drivers/laps, sessions, and progress. Best/manual laps share one selector; teammate comparison lives in the opponent selector. There are no duplicate preset actions. The existing five backend comparison modes remain available through these controls.

Selecting a corner shows only its traversal time, entry/minimum/exit speed, and local time advantage. Whole-lap sectors and gear usage stay in lap analysis. The Analysis tab always ignores selected corners, has no corner switches and shows no generated insight text. All telemetry graphs mark corner apex positions above the distance axis; nearby labels use separate rows and respect the visible distance range.

Telemetry uses the exact shared AppShell width limit (1440px including sidebar padding), without an additional inner width cap. Its title and driver comparison share one stage-style panel; setup has its own panel. The selected meeting supplies the localized Grand Prix title, with circuit and session below. View switches use the site's compact mono button styling; the Conditions tab is removed. The circuit panel is named «Карта трассы». Share images reuse RaceSideShareLogo, local driver portraits, Geist Sans/Mono, obsidian panels and the red bottom band from the existing driver-comparison share cards. All three export formats use the same identity; corner exports show local traversal times and local advantage.

The chart toolbar contains one compact corner selector with previous/next arrows and a Whole Lap option. It is hidden in whole-lap Analysis. There is no duplicate row of corner buttons under the map and no zoom/pan mode selector. The distance slider subscribes to the same cursor store as charts and the track markers, and shows distance in metres.

Telemetry combines gear and RPM charts in «Мотор и передачи». DRS is absent from all Hub views and exports; raw cached provider records remain compatible. Grand Prix selectors omit the «Гран-при» prefix. Driver summaries are compact, and sector statistics sit at the bottom of the map panel. Telemetry sharing has exactly two fixed dashboard exports: horizontal 1600×900 and vertical 1080×1920. Both contain the comparison summary, weather, delta, speed, throttle, braking, gear, RPM, track map and lap analysis; users choose only the orientation. Graph headers never show current or summary values. The lower graph axes show corner numbers instead of distance labels; sector names and boundaries stay above the plot. The track map includes compact corner markers and sector results. The vertical lap-analysis table uses larger labels and values for social-media readability. Graph labels are font-independent vector glyphs so server-rendered exports never depend on nested SVG font support. Share cards omit route breadcrumbs and source metadata, and use file-only native sharing with PNG download as the fallback. Their red acquisition band follows the Fantasy share hierarchy: «Каждая доля секунды» and a short product line on the left, plus `raceside.online/telemetry` and a compact invitation on the right. The Madring share title is «Гран-при Испании», while the circuit name remains in the secondary line.

## Product

RaceSide is a product UI for a premium Formula 1 companion: public fan surfaces, authenticated prediction workflows, and operational admin. The default visual register is product, with occasional brand-led moments on the public home and race weekend pages.

## RaceSide Plus page

RaceSide Plus is not a primary product section in the main navigation. Its entry point is the first row of a unified account dock: the branded `RS+` row keeps the `RaceSide Plus` label horizontally centered and shows `Подключить` or the muted active status with the remaining access time when applicable, while the personal-account action sits below it inside the same bordered surface. The two rows remain separate links, and the public footer may also link to `/plus`.

`/plus` is a public, brand-led product page inside the existing RaceSide shell. It explains the value of the subscription before opening YooMoney or Tribute checkout. It keeps the Apex Performance identity: Geist typography, obsidian surfaces, semantic theme tokens and Ferrari red actions. It must not resemble a separate fintech product or a generic SaaS pricing template.

Design read: a premium motorsport product page for engaged Russian-speaking Formula 1 fans. Design variance is 7/10, motion is 5/10 and visual density is 6/10.

The whole subscription proposition fits in one viewport on standard desktop screens. It uses one dense asymmetric composition: concise value on the left, overlapping real LIVE and Telemetry screenshots on the right, a compact four-benefit rail next, and both paid periods with the checkout action below it. Content follows its natural height instead of stretching to fill the viewport, so pricing stays visually connected to the preview and the outer frame ends directly after checkout. The Telemetry screenshot deliberately overlaps farther to the right and moves forward on hover while LIVE recedes slightly; reduced-motion preferences disable this effect. Mobile preserves the same information in a single narrow composition without separate feature sections. The layout uses semantic theme tokens and must be fully readable in both the existing light and dark themes.

LIVE and Telemetry each require a large real product screenshot. LIVE shows a populated race-session state with positions, intervals, track map and events. Telemetry shows a readable two-driver comparison with delta, speed, throttle, braking and track map. These are first-class page scenes, not small thumbnails inside feature cards. Each has matching light- and dark-theme captures that switch with the site theme, plus a wide desktop asset and a deliberately composed mobile crop or mobile state. Published images are verified static assets with no personal or operational data, never a connection to the current paid stream. Retina-ready sources are served as optimized responsive images with stable dimensions.

The page shows the full subscription proposition, both eligible periods and the available payment methods to guests as well as signed-in users. A guest is asked to sign in or create an account only after pressing the checkout action; the selected period and payment method are kept in the return URL. It has distinct guest, free, pending, active, expired and unavailable states. Active subscribers see the renewal action and their account history rather than a redundant purchase-first hero.

Motion communicates product behavior only and has a reduced-motion fallback. The page supports both existing themes, 375/768/1024/1440 px widths, keyboard navigation and WCAG 2.2 AA. Hero imagery reserves its size and is optimized for LCP; below-fold media loads lazily.

## Stitch Source Of Truth

The current visual source of truth is the Google Stitch project `RaceSide Premium UI System`, design system `Apex Performance`.

Canonical screen mapping:

- `/` — `RaceSide Dashboard`
- `/weekend` — `RaceSide Austrian GP Weekend`
- `/news` — `RaceSide News Hub`
- `/news/[slug]` — `RaceSide Article Detail`
- `/calendar` — `RaceSide Season Calendar`
- `/calendar/[season]/[round]` and report popup — Barcelona GP results/report screens
- `/leaderboard` — `RaceSide Championship Leaderboard Only`
- `/teams`, `/drivers/[slug]`, and `/teams/[lineageSlug]` — season-aware sporting profiles
- `/fantasy` — `RaceSide Fantasy League`
- `/social` — `RaceSide Social Networks Feed`
- `/polls` — `RaceSide Polls`
- `/auth`, `/auth/forgot-password`, `/auth/check-email`, and `/auth/update-password` — `RaceSide Auth Flow`
- `/onboarding` — `RaceSide Onboarding`
- `/admin` — `RaceSide Admin Operations`

Implementation rule: static Stitch HTML is a visual specification, not production code. Production code must keep RaceSide's Next.js App Router, Server Components by default, existing repositories/actions, and Russian product copy.

## Design Direction

Reading this as: a motorsport product for engaged Russian-speaking F1 fans, with a premium sport-app language, leaning toward Stitch's dark `Apex Performance` cockpit system: obsidian surfaces, Ferrari red active states, neon-green live status, sharp editorial hierarchy, dense race-control modules, shadcn/ui primitives, and custom RaceSide tokens.

Scene sentence: a fan opens RaceSide on a phone or laptop in the hour before a race session, wants the key story, the next start time, and their prediction status immediately, and should feel the product is fast, current, and composed.

On `/weekend`, tyre allocation is a compact inline part of the hero: beside the event context on desktop and immediately below the track on mobile. It must consume existing hero space instead of increasing the fixed map/hero height.

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
  --success: oklch(0.7 0.19 150);
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

Stitch references may mention Hanken Grotesk, Inter, and JetBrains Mono. In this repo, use `geist` via `next/font` unless a local font file is added explicitly. Avoid serif as the default product font; RaceSide should feel sharp and modern, not magazine-vintage.

Type rules:

- H1/H2 use balanced wrapping.
- Body copy max width: 65-75ch.
- Dense UI headings stay compact; reserve hero scale for true public hero moments.
- Product UI uses a fixed rem scale rather than viewport-driven font scaling.
- Letter spacing stays at 0 for most UI; display tightening must not go below `-0.04em`.

## Layout

Public surfaces:

- Use a strong cockpit first viewport: current race context, next session, weather/session strip, season geography or track context, and one high-signal right rail.
- On `/`, the current track slot becomes the transparent interactive season globe specified in `13_home_season_globe.md`: no local background, frame, glow, or on-globe controls. Circuit and race pages keep their verified track maps and 3D models.
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
- Admin uses its own `src/app/admin/layout.tsx` and never renders the public navigation, next-session rail, or public footer.
- Desktop uses a collapsible shadcn Sidebar. Mobile uses the Sidebar Sheet drawer. `Cmd+K` and `Ctrl+K` open the section command palette.
- Admin density dials are fixed at variance 3/10, motion 2/10, and density 9/10.
- The page header, metric strip, filters, dense table or mobile rows, and inline action feedback form the standard screen rhythm.
- Status is always communicated with a word and semantic color. Decorative status dots are not used.
- Technical metadata uses Geist Mono inside a bounded scroll area. Secrets, raw payload, and personal Telegram identifiers are never rendered.
- Destructive or publication-wide actions require AlertDialog. Reversible pause, hide, draft, and reject actions are preferred over deletion.
- Admin tables are real shadcn Table components at desktop and readable stacked rows below the table breakpoint.
- Forms use shadcn Field, Input, Select or native select with the same tokens, Textarea, Checkbox, and inline `useActionState` feedback.
- Loading uses layout-matched Skeleton blocks. Empty states explain the next safe action. Errors preserve the user’s data and offer a retry.
- The AI prompt registry is a dense operational list rather than a card grid. Editing opens a titled Dialog with the instruction, task template, allowed variables, protected response contract, and recent version history.
- Each AI prompt version includes its OpenRouter model and response-token limit. Model selection is searchable, shows safe context/pricing metadata, and never exposes provider credentials.
- Saving a prompt creates a draft. Publishing requires AlertDialog confirmation and clearly states that only future processing uses the new version.
- `/admin/systems` groups external APIs, RSS/social sources, and scheduled checks by service. It shows the last real check, next expected check, pause/error state, and a direct path to the relevant settings.
- `/admin/schedules` edits only timing, pause state, and retry count for allowlisted jobs. Cron expressions, shell commands, secrets, and arbitrary worker arguments are never editable.
- `/admin/issues` groups reader reports by state, keeps the original article snapshot and exposes only safe diagnostic context. The public report form sits next to the source at the end of a news article.
- `/admin/users` shows each user's RaceSide Plus status and access end date. Granting or extending Plus uses a confirmed dialog with a read-only user identity, duration, mandatory internal reason and a server-calculated end-date preview. The action copy is `Выдать Plus`, `Продлить Plus` or `Выдать снова`; the normal grant flow cannot shorten active access.
- Published news and social items use a confirmed `Убрать из ленты` action. It is visually secondary, reversible, and never presented as permanent deletion.
- `/admin/ai` compares AI API and X API spend in one date chart; their limits and accounting remain independent.
- The overview section is called `Что требует внимания`; it contains only active failures, pauses, and genuinely stale checks. A healthy state is an explicit empty state, not a list of manual repair jobs.

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

RaceSide LIVE uses a standalone viewport-height shell, a 52px HUD, persistent timing tower and selected driver on desktop, a central tabbed workspace, and an events/radio rail. Mobile replaces columns with workspace tabs. Only bounded panels scroll. It retains Geist, semantic theme tokens, team accents and the existing track assets. Continuous marker movement is isolated from the timing and feed React trees.

The LIVE 2D map divides its centerline into the circuit's marshal sectors without drawing persistent boundaries or labels. While OpenF1 reports one or more sector yellows, only those path segments receive a yellow core and restrained glow; a global clear removes every highlight. The map's accessible label names the active sectors.

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

The telemetry introduction now matches news/social PageTitle, stitch-label and 14px/24px regular-weight description. «Телеметрия · сезон …» remains visible in comparisons. Header height follows its content with 20px padding; it does not inherit the feed hero’s fixed height. Recent comparisons and their local-history UI are removed. The «Аналитика круга» share variant includes the map, selected graph and all nine whole-lap analysis rows except gear usage, formatted by the same helper as the screen.

Desktop public navigation uses compact spacing and rows up to 40px (36px on viewports at most 650px high), shrinking further to fit short windows. Standard users have no sidebar scrolling. The server-rendered Admin link enables internal navigation scrolling through `:has(a[href="/admin"])`; role checks remain in `AdminNavigationItem`. Brand/session/account areas stay visible, desktop width remains 256px, and mobile navigation is unchanged.

Telemetry sector results use the lap-sector timing supplied by OpenF1, matching «Разбор круга». Distance-interpolated elapsed time is only a fallback when complete sector timing is unavailable. Existing saved comparisons recalculate these results from their stored laps when rendered. Share graph corner labels show bare numbers without a `T` prefix.
