# Agent Guide

This repo is intended to be easy for AI agents and human maintainers to modify. Keep this file current when architecture, commands, API assumptions, or workflow expectations change.

## Project Snapshot

- Pagi Pagi Padel Panel is a React 19 + Vite frontend for the Pagi Pagi Padel admin panel.
- The app currently implements authentication, virtual user management, and the Calendar screen, including captured court-booking write actions. Other navigation items are placeholders.
- Local development and static deployments normally call the deployed Worker through `VITE_API_BASE_URL`. The Worker proxies upstream API calls and stores placeholder bookings plus virtual users in D1.

## Commands

```sh
pnpm install
pnpm dev
pnpm build
pnpm preview
```

Use `pnpm build` as the default verification command after code changes.

Pushing `main` to GitHub triggers the project auto-deployment. For publish requests, push the completed commit to `origin/main` unless the user explicitly asks for a PR or a separate branch.

When the user says "push it" or similar, treat that as a publish request: commit the completed work, merge it into the default publishing branch (`main` in this repo, even if the user casually says "master"), and push that branch to GitHub.

For publish requests with user-visible app changes, bump `package.json` version before committing. Use semver judgment: patch for small fixes and UI tweaks, minor for new feature surfaces or meaningful workflow changes, and major only for intentional breaking changes. Docs-only, comment-only, and internal maintenance changes do not need a version bump unless the user explicitly asks.

## Important Files

- `src/App.jsx`: Main app, login flow, shell, calendar UI, calendar data loading, and calendar helper functions.
- `src/api/auth.js`: Login, token persistence, and auth clearing.
- `src/api/client.js`: Authenticated API request wrapper.
- `src/api/config.js`: API URL builder using `VITE_API_BASE_URL`.
- `src/api/placeholders.js`: Optional browser-local placeholder storage escape hatch.
- `src/api/virtualUsers.js`: Worker-owned virtual user CRUD helpers.
- `src/styles.css`: Global styles for the login screen, shell, and calendar.
- `vite.config.js`: Vite config, base path, and local `/api` proxy.
- `docs/architecture.md`: Higher-level architecture and data-flow notes.
- `docs/api.md`: Backend endpoint assumptions and response-shape notes.
- `docs/visual-reference.md`: Current screenshots and design-language guidance for mockups.
- `docs/visual-reference/`: Live app screenshots for login and authenticated Calendar states.

## Environment

- `VITE_API_BASE_URL`: Worker origin for browser requests in local and built/static deployments.
- `PANEL_API_ORIGIN`: Optional backend target for the local Vite proxy.
- `MASTER_USERNAME`: Worker secret for the upstream account used by virtual account logins.
- `MASTER_PASSWORD`: Worker secret for the upstream account used by virtual account logins.
- `VITE_USE_LOCAL_PLACEHOLDERS`: Optional browser-local placeholder storage escape hatch. Leave unset for D1-backed testing.
- `VITE_BASE_PATH`: Vite base path for static deployments, for example `/pagi-pagi-padel-panel/`.

## Current Architecture Notes

- `App.jsx` is intentionally still a single large file from the initial build. It is acceptable to split it when adding meaningful functionality or tests.
- Calendar data is loaded in `loadCalendarData`, which fetches courts, open hours, one schedule response per weekday, and D1-backed placeholder bookings. Calendar fetches are cached in-memory per auth/revenue scope for 30 seconds per visible date; toolbar refresh, browser refresh, placeholder mutations, and real booking write actions force fresh data.
- Virtual account login uses an underscore-prefixed username, for example `_frontdesk`. The Worker validates the D1 virtual user, then logs into upstream with `MASTER_USERNAME` and `MASTER_PASSWORD`.
- Virtual user management is master-only. The Worker rejects `/api/virtual-users` requests from virtual sessions and from real upstream accounts whose `/api/auth/me` identity does not match `MASTER_USERNAME`.
- Virtual user permissions control wrapper navigation and Worker endpoint authorization. The Worker maps virtual sessions to D1 token hashes before proxying upstream routes, rejects endpoints outside the user's allowed screens, requires `Calendar booking` for real booking write actions, and masks calendar money fields unless `Calendar revenue` is granted.
- Placeholder create mode can select multiple courts; the frontend sends one D1 placeholder row per selected court. Multiple placeholders can share the same court/time as a stack, and placeholders that overlap a live booking are treated as waitlist holds. Editing remains one placeholder row at a time.
- Real booking create mode can target multiple dates; the frontend sends one captured upstream `/api/admin/court-booking` request per selected date for offline or registered users. Placeholder conversion stays single-date. Virtual users need `Calendar booking` for these real booking writes, but not `Calendar revenue`; hidden or blank booking prices are submitted as zero. Existing booking actions call the captured payment proof, mark-paid, reschedule, notes, and cancel endpoints.
- Virtual users can create and update placeholder bookings, but the Worker stamps `created_by_name`/`updated_by_name` from the virtual user's display name instead of trusting submitted PIC names.
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
