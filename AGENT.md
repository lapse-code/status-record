# Agent Guide

This repository is for Status Record, a personal study/work tracking tool with a Pomodoro-style timer, passive procrastination tracking, session reviews, labels, sleep logs, daily timelines, weekly timelines, and daily/weekly/monthly analytics. The internal data field name for procrastination remains `startup_delay` for compatibility.

## Working Language

- User-facing discussion and product documentation should be in Chinese unless the user asks otherwise.
- Code, identifiers, database columns, and commit messages should use clear English.

## Current Project Phase

- The project has a React + TypeScript + Vite MVP implementation.
- Data is stored locally in browser IndexedDB through Dexie.
- Before implementation after any context compaction, reload this file plus:
  - `docs/project-overview.md`
  - `docs/current-context.md`
  - `docs/module-map.md`
  - `docs/architecture-overview.md`
  - `docs/api-contract.md`
  - `docs/database-schema.md`
  - `docs/coding-standards.md`
  - `docs/testing-strategy.md`
  - `docs/decision-log.md`
  - `docs/definition-of-done.md`

## Product Priorities

1. Make the timer usable quickly for daily study/work.
2. Record data with as little manual friction as possible.
3. Keep all labels extensible, especially session status, visible product, and not-focused reason labels. The internal label type remains `blocker`.
4. Preserve reliable objective signals where possible:
   - Focus duration comes from completed timer sessions.
   - Procrastination is derived from the canonical timeline: arrival time not covered by focus, break, or not-focused reviewed time.
   - Break balance is derived from completed focus minutes.
5. Keep the data model portable so the first web app can later become a Mac, iOS, or iPad app.

## Implementation Guardrails

- Do not hard-code the five end states as permanent enum-only values. Store them as editable labels with protected defaults.
- The focus/completed status is the protected label id `status-completed`. It is the only reviewed-session status that remains green/focus in timelines. It can be renamed and recolored, but must not be archived or deleted. Do not use the display name to decide focus/non-focus.
- Do not ask the user to self-report procrastination/startup delay in normal flow. Derive it from timestamps.
- In MVP, record attention switch count instead of pretending to measure deep work minutes precisely.
- Sleep is recorded once per date with editable `sleep_duration_minutes` and `energy_score`.
- Breaks use both balance transactions and `break_sessions`; active break time should not be counted as procrastination for the next focus session.
- Arrival represents a complete work cycle from check-in to check-out. Review submission, break start, break extension, break completion, and starting the next focus session must not close, recreate, or reset an open arrival. Only explicit check-out closes arrival records; starting focus may auto-create an arrival only when none is open.
- Focus pauses are represented with `focus_segments`: pause closes the current focus segment and returns time to procrastination; resume opens a new segment in the same focus session.
- Timeline-derived UI metrics must stay source-aligned: "today procrastination" must equal the daily timeline's red `startup_delay` real duration, not the number of red primary-color cells.
- Date-bound records store UTC timestamps plus `local_date` and IANA `time_zone`. New records use the current device time zone; legacy records without `time_zone` fall back to `Asia/Tokyo`. Historical daily and weekly timelines must use the record's own time zone, not the current device time zone.
- Global data actions such as demo data, import, and export must remain reachable when the sidebar is hidden or collapsed. Current UI shows them in the sidebar on wide screens and in the workspace header area when the sidebar action area is hidden.
- Statistics must be reproducible from source records; rollup tables, if added, are caches only.

## Documentation Map

- `docs/project-overview.md`: product purpose, scope, and metrics.
- `docs/current-context.md`: current assumptions and open questions.
- `docs/module-map.md`: planned application modules.
- `docs/architecture-overview.md`: recommended technical shape and data flow.
- `docs/api-contract.md`: internal service contracts and data shapes.
- `docs/database-schema.md`: logical schema for the first implementation.
- `docs/coding-standards.md`: engineering conventions.
- `docs/testing-strategy.md`: verification strategy.
- `docs/decision-log.md`: initial product and technical decisions.
- `docs/definition-of-done.md`: completion criteria.

## Before Marking Work Done

- Update relevant docs when behavior, schema, or terminology changes.
- Run available tests and formatting once a stack exists.
- Check timer, review, sleep, labels, and analytics flows against `docs/definition-of-done.md`.

## Current Commands

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Unit tests: `npm run test:run`
- Lint: `npm run lint`
- Build: `npm run build`
- E2E: `npm run e2e`
