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
- Settings diagnostics for the deployed frontend/backend version, commit, and build time.
- Placeholder screens for Dashboard, Court Prices, Event, Coach, Add On, Customers, and Setting.

For AI-agent onboarding, start with `AGENTS.md`, then read `docs/architecture.md`, `docs/api.md`, `docs/visual-reference.md`, and `docs/typography.md`.

## Quick Start

```sh
pnpm install
pnpm dev
```

Open the Vite dev URL printed by the terminal, usually `http://localhost:5173`.

For this workspace, `.env.local` points Vite at the deployed Worker so local testing uses the same D1-backed placeholder storage as production.

For fast UI previewing without real credentials or Worker access, use the
browser-local mock API:

```sh
pnpm dev:mock
```

Mock credentials:

- Master/admin: `admin@example.com` / `password`
- Virtual staff with booking + revenue access: `_frontdesk` / `password`
- Virtual read-only staff with hidden revenue: `_readonly` / `password`

The mock API seeds courts, weekly schedule rows, placeholder stacks, waitlist
holds, player search results, virtual users, and mutable booking actions in this
browser's `localStorage` under `panel.mockApiState.v1`. To reset the mock data,
remove that key from DevTools and reload.

## Commands

```sh
pnpm dev
pnpm dev:mock
pnpm lint
pnpm test
pnpm build
pnpm build:mock
pnpm preview
```

- `pnpm dev`: start the Vite dev server.
- `pnpm dev:mock`: start Vite with `VITE_USE_MOCK_API=true` from `.env.mock`.
- `pnpm lint`: run ESLint import/undefined-name and React hook checks.
- `pnpm test`: run focused Vitest unit tests for pure helpers.
- `pnpm build`: create a production build. Use this as the default verification command.
- `pnpm build:mock`: build the app with the browser-local mock API enabled.
- `pnpm preview`: preview the production build locally.

## Environment

The app should normally call the deployed Worker through `VITE_API_BASE_URL`. The Worker proxies ordinary `/api/*` requests to the upstream service and stores `/api/placeholder-bookings` in D1.

```sh
VITE_API_BASE_URL=<worker-origin>
VITE_BASE_PATH=/
```

- `VITE_API_BASE_URL`: Worker origin used by local and static deployments.
- `VITE_USE_MOCK_API`: when set to `true`, browser requests are handled by the local mock API in `src/api/mockApi.js` instead of the Worker.
- `VITE_MOCK_API_DELAY_MS`: optional artificial delay for mock API responses. Defaults to 80ms in `.env.mock`.
- `PANEL_API_ORIGIN`: optional backend target used only when running through the Vite dev proxy.
- `VITE_USE_LOCAL_PLACEHOLDERS`: optional escape hatch for browser-local placeholder storage. Leave unset for D1-backed testing.
- `VITE_BASE_PATH`: base path for static deployments.
- `UPSTREAM_ORIGIN`: Worker secret/var for the upstream API origin.
- `MASTER_USERNAME`: Worker secret for the real upstream account allowed to manage virtual users; also used as the single virtual-login upstream account when no account pool is configured.
- `MASTER_PASSWORD`: Worker secret for the single-account virtual-login fallback when no account pool is configured.
- `UPSTREAM_ACCOUNTS_JSON`: optional Worker secret containing a JSON array of upstream accounts for virtual-user sessions, for example `[{"username":"admin-a@example.com","password":"..."},{"username":"admin-b@example.com","password":"..."}]`.
- `VIRTUAL_SESSION_TTL_SECONDS` / `VIRTUAL_SESSION_REMEMBER_TTL_SECONDS`: optional Worker vars for panel-token lifetime. Defaults are 12 hours and 30 days.
- `WORKER_LOG_LEVEL`: optional Worker log threshold (`debug`, `info`, `warn`, `error`, or `silent`). Defaults to `info`.
- `VITE_APP_VERSION` / `VITE_BUILD_COMMIT` / `VITE_BUILD_TIMESTAMP`: optional frontend build metadata shown in Settings. The GitHub workflow fills these automatically.
- `WORKER_VERSION` / `WORKER_BUILD_COMMIT` / `WORKER_BUILD_TIMESTAMP`: Worker vars shown by `/api/panel/version`. The GitHub workflow passes these to Wrangler automatically.
- `PANEL_PROXY_ORIGIN`: GitHub repository secret used by the deployment workflow as the static bundle's `VITE_API_BASE_URL`.
- `CLOUDFLARE_ACCOUNT_ID`: GitHub repository secret used by Wrangler in CI.
- `CLOUDFLARE_API_TOKEN`: GitHub repository secret used by Wrangler in CI.

## Worker And D1

The Worker proxies ordinary `/api/*` requests to the configured upstream service. `/api/placeholder-bookings` and `/api/virtual-users` are handled locally by the Worker and stored in Cloudflare D1. Virtual users sign in with usernames like `_frontdesk`; the Worker validates that virtual user password, selects the least-loaded configured upstream account, ensures that account has a fresh shared upstream token in D1, and returns only a Worker-issued panel session token to the browser. Virtual session rows store the assigned upstream username; the reusable upstream token itself lives in `upstream_account_tokens` and is swapped into proxied requests after permission checks.

Real logins use the same shared-token model. The Worker returns a per-device panel token, stores that panel token in `real_sessions`, and proxies later API requests through the single reusable upstream token for that account. Server-configured accounts from `UPSTREAM_ACCOUNTS_JSON` or the `MASTER_USERNAME`/`MASTER_PASSWORD` fallback can refresh expired shared tokens with configured credentials. Unknown real accounts seed the shared token plus a salted password hash after their first successful upstream login; later matching-password logins reuse the stored upstream token without creating another upstream login while that token is fresh.

Virtual-user permissions are enforced in the Worker before upstream proxying. Screen permissions map to captured endpoint groups, `Calendar booking` controls real booking write actions, and `Calendar revenue` controls whether calendar money fields are returned. Real booking creation and placeholder conversion require `Calendar` plus `Calendar booking`, but do not require `Calendar revenue`; hidden or blank booking prices are submitted as zero. Placeholder booking audit names are server-stamped for virtual users, so they cannot submit another PIC name as creator/updater.

Workers Logs are enabled in `wrangler.toml` with full request sampling. The Worker emits structured object logs for upstream proxy responses, virtual-login failures, and unhandled exceptions. Responses include `X-Panel-Request-ID`, which can be matched to the `request_id` field in Cloudflare Workers Logs or real-time log tail output. Logs intentionally avoid request bodies, passwords, bearer tokens, and cookie values.

The current `wrangler.toml` is bound to the project D1 database. To create a new database for another environment:

```sh
wrangler d1 create pagi-pagi-padel-placeholders
```

Set the master upstream credentials as Worker secrets before enabling virtual login. To rotate virtual sessions across multiple upstream accounts, also set `UPSTREAM_ACCOUNTS_JSON`; otherwise virtual login falls back to `MASTER_USERNAME` and `MASTER_PASSWORD`.

```sh
wrangler secret put MASTER_USERNAME
wrangler secret put MASTER_PASSWORD
wrangler secret put UPSTREAM_ACCOUNTS_JSON
```

## Repository Overview

```text
src/
  main.jsx          React entrypoint
  App.jsx           Composition root + panel shell (login vs panel, nav gating)
  api/              Network, auth, Worker/mock-owned data, calendar cache/endpoints
  calendar/         Calendar feature UI, state hooks, dialogs, and form builders
  lib/              Pure helpers and focused unit tests
  screens/          Login and virtual-user management screens
  styles.css        CSS entrypoint importing grouped styles from src/styles/
  styles/           Global CSS split by feature area
docs/
  architecture.md Architecture and data-flow notes
  api.md          Backend endpoint assumptions
  typography.md   Typography tokens, scale, weights, and usage rules
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
- Before changing app typography, use the tokens and rules in `docs/typography.md`; avoid ad hoc font sizes, in-between weights, negative tracking, or viewport-scaled type.
- When the app's visual design changes materially, refresh the visual-reference screenshots so future mockups stay aligned with the real UI.
- Keep backend response field names visible at the boundary. If fields need nicer frontend names, map them in one place instead of renaming them throughout the UI.
- Use `pnpm dev:mock` for fast visual checks when live credentials or Worker data are unnecessary. Mock mode exercises the same frontend API functions and stores mutable preview data in `localStorage`.
- Calendar data is cached only in memory for the `CALENDAR_DATA_CACHE_TTL_MS` window (`src/constants.js`, currently 2 minutes) per auth/revenue scope and visible date. The toolbar refresh button, browser reload, and placeholder mutations intentionally bypass or clear that cache.
- Automated tests currently cover booking helpers, calendar form payload builders, and virtual-user navigation helpers. Keep new tests focused around pure helper behavior unless a UI workflow change needs broader coverage.

## Production Deployment

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` deploys both production surfaces on pushes to `main`/`master`:

- GitHub Pages gets the static Vite bundle built with:

```sh
VITE_BASE_PATH=/pagi-pagi-padel-panel/
VITE_API_BASE_URL=<worker-origin>
```

- Cloudflare Workers gets the `wrangler.toml` Worker deployed with `pnpm worker:deploy`.

The static UI loads from GitHub Pages and calls the Worker origin configured in the `PANEL_PROXY_ORIGIN` repository secret. The Worker deployment requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` repository secrets. The workflow also injects the resolved commit SHA, package version, and UTC build timestamp into both the frontend bundle and Worker deployment so Settings can show the exact deployed state.

After both production deployments finish, the same workflow run marks the deployed commit's `production/tested` status as pending and waits on the `production-tested` environment. Configure that GitHub environment with at least one required reviewer; approving the environment after checking production flips `production/tested` to success, while rejecting it leaves the run unconfirmed.

For rollback, open the `Deploy App` workflow and either re-run a previous successful run or run the workflow manually from `main` with the `ref` input set to a commit SHA, branch, or tag. The workflow resolves that ref once, builds the frontend from it, and deploys the Worker from the same commit SHA. GitHub workflow re-runs are only available for a limited window, so use tags or commit SHAs with the manual `ref` input for older rollbacks.

## Troubleshooting

- If local login/API calls fail, check `.env.local` and confirm `VITE_API_BASE_URL` points at the deployed Worker.
- If API calls fail after production deployment, check the `PANEL_PROXY_ORIGIN` GitHub secret and Worker deployment status.
- If the Worker deploy job fails before Wrangler runs, confirm the `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` GitHub repository secrets exist.
- If login succeeds but later requests fail with `401`, stored auth is cleared by `src/api/client.js` and the user should sign in again.
