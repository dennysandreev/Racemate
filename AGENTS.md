# RaceMate Agent Instructions

Read these files before planning or changing the project:
- `PRODUCT.md`
- `DESIGN.md`
- `SKILLS.md`
- the relevant numbered requirement document for the area being changed

## Product Defaults

- Product name: RaceMate.
- UI language: Russian by default.
- Primary register: product UI.
- Frontend direction: premium motorsport app, restrained and task-focused.
- V1 excludes Telegram, web push, notification dispatch, and notification preferences.

## Skill Defaults

- For frontend work, use `design-taste-frontend` and `impeccable`.
- For Next.js work, use `next-best-practices`.
- For shadcn/ui components, use `shadcn`.
- For UI copy, use `content-design` plus the copy rules in `PRODUCT.md` and `DESIGN.md`.
- For bugs and failed checks, use `systematic-debugging` before fixing.
- For browser validation, use the Browser plugin or `playwright`.

## Implementation Defaults

- Prefer minimal, local, reversible changes.
- Follow existing project documents before inventing new architecture.
- Do not add dependencies unless the current stack cannot solve the task cleanly.
- Use Supabase Auth/Postgres, Next.js App Router, TypeScript, Tailwind, shadcn/ui, and a Node worker unless the user changes the architecture.
- Keep external API calls in backend/worker code, never directly in frontend UI.
- Cache external data in the database.
- Use Russian product copy that sounds natural to end users, not internal/system labels.

## Validation

After code changes, run relevant checks when available:
- lint
- typecheck
- tests
- build
- browser/UI validation for frontend changes

If a check is unavailable or cannot be run, mention it in the final response.
