# Agent Guide

This repository is for Status Record, a personal study/work tracking tool with a Pomodoro-style timer, passive startup-delay tracking, session reviews, labels, sleep logs, and daily/weekly/monthly analytics.

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
3. Keep all labels extensible, especially session status, visible product, and blocker labels.
4. Preserve reliable objective signals where possible:
   - Study duration comes from completed timer sessions.
   - Startup delay is derived from arrival/check-in time to first focus timer start.
   - Break balance is derived from completed focus minutes.
5. Keep the data model portable so the first web app can later become a Mac, iOS, or iPad app.

## Implementation Guardrails

- Do not hard-code the five end states as permanent enum-only values. Store them as editable labels with protected defaults.
- Do not ask the user to self-report startup delay in normal flow. Derive it from timestamps.
- In MVP, record attention switch count instead of pretending to measure deep work minutes precisely.
- Sleep is recorded once per date with editable `sleep_duration_minutes` and `energy_score`.
- Breaks use both balance transactions and `break_sessions`; active break time should not be counted as startup delay for the next focus session.
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
