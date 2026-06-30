# Pagi Pagi Padel Panel

React/Vite frontend client for the Pagi Pagi Padel admin panel.

## What This App Does

This app provides the browser UI for managing Pagi Pagi Padel admin workflows. It currently includes:

- Login with panel credentials.
- Virtual account login with an underscore-prefixed username, backed by Worker-managed users.
- Virtual account screen/action permissions, Worker endpoint authorization, and optional Calendar revenue visibility.
- Authenticated session storage in the browser.
- A wired Calendar screen with day/week views, short-lived in-memory date caching, court bookings, booking details, write actions, and summary metrics.
- Real court booking create flows for offline customers and registered Courtside users, including bulk creation across selected dates, plus payment receipt upload, mark-paid, reschedule, notes, and cancellation actions from captured upstream APIs.
- D1-backed placeholder bookings for tentative holds before payment or upstream confirmation, including multi-court create, same-slot placeholder stacks, waitlist holds behind live bookings, and conversion into real upstream bookings.
- Placeholder screens for Dashboard, Court Prices, Event, Coach, Add On, Customers, and Setting.

For AI-agent onboarding, start with `AGENTS.md`, then read `docs/architecture.md`, `docs/api.md`, and `docs/visual-reference.md`.

## Quick Start

```sh
pnpm install
pnpm dev
```

Open the Vite dev URL printed by the terminal, usually `http://localhost:5173`.

For this workspace, `.env.local` points Vite at the deployed Worker so local testing uses the same D1-backed placeholder storage as production.

## Commands

```sh
pnpm lint
pnpm test
pnpm build
pnpm preview
```

- `pnpm dev`: start the Vite dev server.
- `pnpm lint`: run ESLint import/undefined-name and React hook checks.
- `pnpm test`: run focused Vitest unit tests for pure helpers.
- `pnpm build`: create a production build. Use this as the default verification command.
- `pnpm preview`: preview the production build locally.

## Environment

The app should normally call the deployed Worker through `VITE_API_BASE_URL`. The Worker proxies ordinary `/api/*` requests to the upstream service and stores `/api/placeholder-bookings` in D1.

```sh
VITE_API_BASE_URL=<worker-origin>
VITE_BASE_PATH=/
```

- `VITE_API_BASE_URL`: Worker origin used by local and static deployments.
- `PANEL_API_ORIGIN`: optional backend target used only when running through the Vite dev proxy.
- `VITE_USE_LOCAL_PLACEHOLDERS`: optional escape hatch for browser-local placeholder storage. Leave unset for D1-backed testing.
- `VITE_BASE_PATH`: base path for static deployments.
- `UPSTREAM_ORIGIN`: Worker secret/var for the upstream API origin.
- `MASTER_USERNAME`: Worker secret for the real upstream account used by virtual users.
- `MASTER_PASSWORD`: Worker secret for the real upstream account used by virtual users.
- `WORKER_LOG_LEVEL`: optional Worker log threshold (`debug`, `info`, `warn`, `error`, or `silent`). Defaults to `info`.

## Worker And D1

The Worker proxies ordinary `/api/*` requests to the configured upstream service. `/api/placeholder-bookings` and `/api/virtual-users` are handled locally by the Worker and stored in Cloudflare D1. Virtual users sign in with usernames like `_frontdesk`; the Worker validates that virtual user password, then signs into upstream using `MASTER_USERNAME` and `MASTER_PASSWORD`.

Virtual-user permissions are enforced in the Worker before upstream proxying. Screen permissions map to captured endpoint groups, `Calendar booking` controls real booking write actions, and `Calendar revenue` controls whether calendar money fields are returned. Real booking creation and placeholder conversion require `Calendar` plus `Calendar booking`, but do not require `Calendar revenue`; hidden or blank booking prices are submitted as zero. Placeholder booking audit names are server-stamped for virtual users, so they cannot submit another PIC name as creator/updater.

Workers Logs are enabled in `wrangler.toml` with full request sampling. The Worker emits structured object logs for upstream proxy responses, virtual-login failures, and unhandled exceptions. Responses include `X-Panel-Request-ID`, which can be matched to the `request_id` field in Cloudflare Workers Logs or real-time log tail output. Logs intentionally avoid request bodies, passwords, bearer tokens, and cookie values.

The current `wrangler.toml` is bound to the project D1 database. To create a new database for another environment:

```sh
wrangler d1 create pagi-pagi-padel-placeholders
```

Set the master upstream credentials as Worker secrets before enabling virtual login:

```sh
wrangler secret put MASTER_USERNAME
wrangler secret put MASTER_PASSWORD
```

## Repository Overview

```text
src/
  main.jsx          React entrypoint
  App.jsx           Composition root + panel shell (login vs panel, nav gating)
  api/              Network, auth, Worker-owned data, calendar cache/endpoints
  calendar/         Calendar feature UI, state hooks, dialogs, and form builders
  lib/              Pure helpers and focused unit tests
  screens/          Login and virtual-user management screens
  styles.css        CSS entrypoint importing grouped styles from src/styles/
  styles/           Global CSS split by feature area
docs/
  architecture.md Architecture and data-flow notes
  api.md          Backend endpoint assumptions
  visual-reference.md
                  Current screenshots and design-language guidance
  visual-reference/
                  Live app screenshots for mockup alignment
AGENTS.md         AI-agent working guide (start here; has the full Code Map)
```

For the canonical file-by-file code map, use `AGENTS.md`. This README keeps only
the high-level orientation for human readers.

## Development Notes

- The code is split into layers: `App.jsx` (shell) -> `src/screens` + `src/calendar` (feature UI) -> `src/api` + `src/lib` (network + pure helpers) -> `src/constants.js`. Add new code to the matching layer instead of growing one file. See the Code Map in `AGENTS.md`.
- Keep the dependency direction downward (lower layers must not import components) so the module graph stays cycle-free.
- When moving or splitting code, update `AGENTS.md`, this README, and the relevant docs so the repo remains AI-friendly.
- Use `pnpm lint` after moving imports or extracting modules. ESLint catches undefined free identifiers that `vite build` can miss.
- Add focused `pnpm test` coverage when changing pure helpers in `src/lib/` or `src/calendar/forms.js`.
- Before generating UI mockups or design variants, review `docs/visual-reference.md` and the screenshots in `docs/visual-reference/`.
- When the app's visual design changes materially, refresh the visual-reference screenshots so future mockups stay aligned with the real UI.
- Keep backend response field names visible at the boundary. If fields need nicer frontend names, map them in one place instead of renaming them throughout the UI.
- Calendar data is cached only in memory for the `CALENDAR_DATA_CACHE_TTL_MS` window (`src/constants.js`, currently 2 minutes) per auth/revenue scope and visible date. The toolbar refresh button, browser reload, and placeholder mutations intentionally bypass or clear that cache.
- Automated tests currently cover booking helpers, calendar form payload builders, and virtual-user navigation helpers. Keep new tests focused around pure helper behavior unless a UI workflow change needs broader coverage.

## GitHub Pages

This app can be deployed as a static Vite bundle. The GitHub Actions workflow builds with:

```sh
VITE_BASE_PATH=/pagi-pagi-padel-panel/
VITE_API_BASE_URL=<worker-origin>
```

The static UI loads from GitHub Pages and calls the Worker origin configured in the `PANEL_PROXY_ORIGIN` repository secret.

## Troubleshooting

- If local login/API calls fail, check `.env.local` and confirm `VITE_API_BASE_URL` points at the deployed Worker.
- If API calls fail after static deployment, check the `PANEL_PROXY_ORIGIN` GitHub secret and Worker deployment status.
- If login succeeds but later requests fail with `401`, stored auth is cleared by `src/api/client.js` and the user should sign in again.
