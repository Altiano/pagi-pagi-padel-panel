# Pagi Pagi Padel Panel

React/Vite frontend client for the Pagi Pagi Padel admin panel.

## What This App Does

This app provides the browser UI for managing Pagi Pagi Padel admin workflows. It currently includes:

- Login with panel credentials.
- Authenticated session storage in the browser.
- A wired Calendar screen with day/week views, court bookings, booking details, and summary metrics.
- Local placeholder bookings for tentative holds before payment or upstream Court Site confirmation.
- Placeholder screens for Dashboard, Court Prices, Event, Coach, Add On, Customers, and Setting.

For AI-agent onboarding, start with `AGENTS.md`, then read `docs/architecture.md`, `docs/api.md`, and `docs/visual-reference.md`.

## Quick Start

```sh
pnpm install
PANEL_API_ORIGIN=https://panel.courtside.id pnpm dev
```

Open the Vite dev URL printed by the terminal, usually `http://localhost:5173`.

`pnpm dev` by itself uses the default proxy target `http://127.0.0.1:8787`. Use that only when you are also running the local Worker proxy on port `8787`; otherwise login/API calls will fail with `ECONNREFUSED`.

## Commands

```sh
pnpm build
pnpm preview
```

- `pnpm dev`: start the Vite dev server.
- `pnpm build`: create a production build. Use this as the default verification command.
- `pnpm preview`: preview the production build locally.

## Environment

The dev server proxies `/api/*` to the configured panel API origin, so the browser can call the existing backend through same-origin local requests.

```sh
PANEL_API_ORIGIN=https://panel.courtside.id
VITE_API_BASE_URL=
VITE_BASE_PATH=/
```

- `PANEL_API_ORIGIN`: backend target used by the Vite proxy during local development. Use `https://panel.courtside.id` for normal local login/API testing, or `http://127.0.0.1:8787` when testing through a local Worker proxy.
- `VITE_API_BASE_URL`: API origin used by built/static deployments. Leave empty when same-origin or local proxy requests should be used.
- `VITE_BASE_PATH`: base path for static deployments.

## Worker And D1

The Worker proxies ordinary `/api/*` requests to the configured upstream service. `/api/placeholder-bookings` is handled locally by the Worker and stored in Cloudflare D1, so tentative holds stay inside this wrapper until a future confirmed-booking flow sends data to Court Site.

Create a free D1 database and replace the `database_id` in `wrangler.toml` before deploying the Worker:

```sh
wrangler d1 create pagi-pagi-padel-placeholders
```

## Repository Map

```text
src/
  api/
    auth.js       Login, localStorage auth persistence, logout cleanup
    client.js     Authenticated API request helper
    config.js     API URL builder
  App.jsx         Main React app, shell, Calendar screen, calendar helpers
  main.jsx        React entrypoint
  styles.css      Global app styles
docs/
  architecture.md Architecture and data-flow notes
  api.md          Backend endpoint assumptions
  visual-reference.md
                  Current screenshots and design-language guidance
  visual-reference/
                  Live app screenshots for mockup alignment
AGENTS.md         AI-agent working guide
```

## Development Notes

- `src/App.jsx` currently contains the main app, feature UI, data loading, and calendar helper functions in one file.
- It is acceptable to split components, utilities, and API modules when that makes a requested change safer or faster.
- When splitting code, update `AGENTS.md`, this README, and the relevant docs so the repo remains AI-friendly.
- Before generating UI mockups or design variants, review `docs/visual-reference.md` and the screenshots in `docs/visual-reference/`.
- When the app's visual design changes materially, refresh the visual-reference screenshots so future mockups stay aligned with the real UI.
- Keep backend response field names visible at the boundary. If fields need nicer frontend names, map them in one place instead of renaming them throughout the UI.
- There are no automated tests yet. If calendar logic changes, a useful first test target is extracting pure date/time/summary helpers from `App.jsx`.

## GitHub Pages

This app can be deployed as a static Vite bundle. The GitHub Actions workflow builds with:

```sh
VITE_BASE_PATH=/pagi-pagi-padel-panel/
VITE_API_BASE_URL=<panel-api-origin>
```

The static UI will load from GitHub Pages, but authenticated API calls still depend on the panel API allowing browser requests from the Pages origin. If the backend does not allow that CORS origin, keep using the local Vite proxy or add a small API proxy for production.

## Troubleshooting

- If local login/API calls fail with `ECONNREFUSED 127.0.0.1:8787`, restart Vite with `PANEL_API_ORIGIN=https://panel.courtside.id pnpm dev`.
- If API calls fail locally for another reason, check `PANEL_API_ORIGIN` and confirm the backend is reachable from the machine running Vite.
- If API calls fail after static deployment, check `VITE_API_BASE_URL` and backend CORS configuration.
- If login succeeds but later requests fail with `401`, stored auth is cleared by `src/api/client.js` and the user should sign in again.
