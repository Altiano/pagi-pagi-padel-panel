# Agent Guide

This repo is intended to be easy for AI agents and human maintainers to modify. Keep this file current when architecture, commands, API assumptions, or workflow expectations change.

## Project Snapshot

- Pagi Pagi Padel Panel is a React 19 + Vite frontend for the Pagi Pagi Padel admin panel.
- The app currently implements authentication plus the Calendar screen. Other navigation items are placeholders.
- Local development and static deployments normally call the deployed Worker through `VITE_API_BASE_URL`. The Worker proxies upstream API calls and stores placeholder bookings in D1.

## Commands

```sh
pnpm install
pnpm dev
pnpm build
pnpm preview
```

Use `pnpm build` as the default verification command after code changes.

## Important Files

- `src/App.jsx`: Main app, login flow, shell, calendar UI, calendar data loading, and calendar helper functions.
- `src/api/auth.js`: Login, token persistence, and auth clearing.
- `src/api/client.js`: Authenticated API request wrapper.
- `src/api/config.js`: API URL builder using `VITE_API_BASE_URL`.
- `src/api/placeholders.js`: Optional browser-local placeholder storage escape hatch.
- `src/styles.css`: Global styles for the login screen, shell, and calendar.
- `vite.config.js`: Vite config, base path, and local `/api` proxy.
- `docs/architecture.md`: Higher-level architecture and data-flow notes.
- `docs/api.md`: Backend endpoint assumptions and response-shape notes.
- `docs/visual-reference.md`: Current screenshots and design-language guidance for mockups.
- `docs/visual-reference/`: Live app screenshots for login and authenticated Calendar states.

## Environment

- `VITE_API_BASE_URL`: Worker origin for browser requests in local and built/static deployments.
- `PANEL_API_ORIGIN`: Optional backend target for the local Vite proxy.
- `VITE_USE_LOCAL_PLACEHOLDERS`: Optional browser-local placeholder storage escape hatch. Leave unset for D1-backed testing.
- `VITE_BASE_PATH`: Vite base path for static deployments, for example `/pagi-pagi-padel-panel/`.

## Current Architecture Notes

- `App.jsx` is intentionally still a single large file from the initial build. It is acceptable to split it when adding meaningful functionality or tests.
- Calendar data is loaded in `loadCalendarData`, which fetches courts, open hours, one schedule response per weekday, and D1-backed placeholder bookings.
- Authentication is stored in localStorage under `panel.auth` plus Nuxt-compatible keys used for parity checks.
- A `401` response clears stored auth in `apiRequest`.

## Change Guidance

- Prefer small, behavior-focused changes with `pnpm build` verification.
- When adding a new feature screen, consider extracting that screen from `App.jsx` instead of making the file larger.
- When touching calendar logic, consider moving pure helpers into a calendar utility module and adding tests.
- Keep API field names aligned with the existing backend payloads. Do not rename backend-derived fields unless there is a mapping layer.
- Keep docs in sync with code changes. If a future refactor changes the component layout, update this guide, `README.md`, and relevant files in `docs/`.

## Visual And Mockup Guidance

Before generating mockup images, redesign concepts, or UI variants, review `docs/visual-reference.md` and the screenshots in `docs/visual-reference/`.

Mockups should stay close to the current app's design language unless the user explicitly asks for a larger redesign. Preserve the existing feel: off-white and pale green surfaces, deep green primary actions, compact admin density, restrained rounded controls, subtle borders, and muted operational status colors.

When the web app's visual design changes materially, update the visual-reference screenshots and `docs/visual-reference.md` in the same change or as soon as practical. This keeps future AI-generated mockups aligned with the real product instead of drifting into unrelated styles.

## Refactoring Permission

Future AI agents may freely refactor this guide, the README, and the docs when the code structure changes or when a better organization would help future work. They may also split components, utilities, and API modules when the current structure becomes inefficient for the requested change.

Good triggers for refactoring:

- `src/App.jsx` becomes harder to scan or gains another full feature module.
- Calendar helper functions need tests.
- Multiple screens share shell, toolbar, or data-fetching patterns.
- API assumptions move from guessed shapes to stable backend contracts.
- Documentation no longer matches the fastest way to understand the repo.

When refactoring, keep the repo AI-friendly by preserving a clear entrypoint, command list, architecture map, and API assumptions.
