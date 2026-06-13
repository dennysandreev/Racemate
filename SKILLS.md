# RaceMate Skill Stack

This file records the default skill stack for building RaceMate. It is a project rule for future Codex work in this repository.

## Always Use For Frontend

### `design-taste-frontend`

Use for visual direction and anti-template discipline. In this environment it is the installed local `tasteskill: Anti-Slop Frontend Skill`.

Apply it when:
- designing public pages, app shells, dashboards, admin screens, or reusable UI;
- choosing layout, typography, motion, density, and component composition;
- checking that RaceMate does not drift into generic AI/SaaS visual patterns.

### `impeccable`

Use for product UI craft, design-system discipline, accessibility, responsive behavior, motion quality, UX quality, and pre-ship polish.

Project setup requirement:
- `PRODUCT.md` must exist before frontend work.
- `DESIGN.md` must exist before substantial frontend implementation.
- If either file is stale after a major product/design decision, update it before continuing.

## Core Engineering Skills

### `next-best-practices`

Use for Next.js App Router, React Server Components, route handlers, metadata, async APIs, image/font optimization, self-hosting, and Docker-oriented deployment decisions.

Default Next.js decisions:
- App Router.
- Server Components by default.
- Client Components only for interactivity, browser APIs, local state, and motion.
- Node.js runtime unless Edge is explicitly justified.
- `next/font` for all fonts.
- `output: "standalone"` for VPS Docker builds.

### `shadcn`

Use for shadcn/ui setup and component work.

Default component strategy:
- Use shadcn/ui primitives before custom markup.
- Use semantic tokens instead of raw colors.
- Use proper form, dialog, sheet, table, empty state, skeleton, alert, toast, and chart components.
- Do not import components that have not been installed.
- Fetch component docs before using unfamiliar shadcn components.

### `ui-ux-pro-max`

Use for design-system research, stack-specific UI guidance, chart guidance, accessibility guidance, and product surface review.

For RaceMate, use it as an input, not an override. If its recommendations conflict with `PRODUCT.md`, `DESIGN.md`, `design-taste-frontend`, or `impeccable`, the project documents and mandatory frontend skills win.

### `content-design`

Use for user-facing copy, onboarding, empty states, buttons, validation, errors, confirmations, admin labels, and i18n strings.

RaceMate copy rules:
- Russian by default.
- Natural product language over technical labels.
- Short action verbs for buttons.
- No database-field, API, or system-status wording in user UI.

### `systematic-debugging`

Use whenever there is a bug, failed check, unexpected behavior, build failure, integration issue, auth issue, worker failure, or API problem.

Rule:
- Reproduce and identify the root cause before changing code.
- Prefer narrow fixes with evidence over broad guesses.

### `playwright` And Browser Plugin

Use for real browser validation:
- responsive checks;
- screenshots;
- UI flow debugging;
- forms and auth-like flows;
- visual inspection after frontend changes.

Prefer the Browser plugin for local interactive app inspection when available. Use the Playwright skill for CLI-driven browser automation and artifacts.

## Conditional Skills

### `imagegen`

Use only when RaceMate needs generated bitmap assets such as covers, driver-style avatars, helmet concepts, editorial imagery, or promotional visuals.

### `brandkit`

Use when creating or revising RaceMate's logo system, brand board, identity guide, or visual-world deck.

### `figma` And `figma-implement-design`

Use only when a Figma URL, node ID, or design-to-code request is present.

### `gh-fix-ci`

Use only after GitHub Actions, pull requests, or CI failures exist.

### `openai-docs`

Use only for OpenAI product/API questions. RaceMate's planned AI provider is OpenRouter, so do not use this skill for OpenRouter unless the task explicitly involves OpenAI.

## Not Default

Do not use these as standing RaceMate defaults:
- `frontend-design`
- `high-end-visual-design`
- `frontend-skill`
- `gpt-taste`
- `minimalist-ui`
- `industrial-brutalist-ui`
- `doc`
- `pdf`
- `spreadsheets`
- `presentations`

They may be used only when the user explicitly requests their direction or the task clearly requires them.

## Default Workflow

1. Read `PRODUCT.md`, `DESIGN.md`, and this file.
2. For frontend work, apply `design-taste-frontend` and `impeccable`.
3. For Next.js implementation, apply `next-best-practices`.
4. For component work, apply `shadcn`.
5. For user-facing text, apply `content-design`.
6. For bugs or failed checks, apply `systematic-debugging`.
7. For UI verification, use Browser or `playwright`.
