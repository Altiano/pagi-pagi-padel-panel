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
pnpm lint
pnpm test
pnpm build
pnpm preview
```

Use `pnpm build` as the default verification command after code changes. Run
`pnpm lint` after moving imports or splitting modules, and run `pnpm test` when
changing pure helpers or calendar form payload builders.

Pushing `main` to GitHub triggers the project auto-deployment. For publish requests, push the completed commit to `origin/main` unless the user explicitly asks for a PR or a separate branch.

When the user says "push it" or similar, treat that as a publish request: commit the completed work, merge it into the default publishing branch (`main` in this repo, even if the user casually says "master"), and push that branch to GitHub.

For publish requests with user-visible app changes, bump `package.json` version before committing. Use semver judgment: patch for small fixes and UI tweaks, minor for new feature surfaces or meaningful workflow changes, and major only for intentional breaking changes. Docs-only, comment-only, and internal maintenance changes do not need a version bump unless the user explicitly asks.

## Code Map (start here)

The app is organized in layers. Dependencies only point downward (leaves at the
bottom), so there are no import cycles. To find something fast, match the task to
a layer:

```text
src/
  main.jsx                       React entrypoint; mounts <App/>.
  App.jsx                        Composition root: login-vs-panel, panel shell
                                 (sidebar / mobile chrome), /auth/me load, and
                                 virtual-user nav/permission gating.
  constants.js                   Shared constants: nav groups, permission lists,
                                 cache TTL, placeholder statuses, durations.
  hooks.js                       usePreferredMobileView, useEscapeKey.
  styles.css                     CSS entrypoint importing grouped global styles.
  styles/
    base.css                     Tokens, element defaults, shared form/buttons.
    shell.css                    Panel shell, sidebar, placeholder screens.
    login.css                    Login screen.
    virtual-users.css            Virtual user management.
    calendar.css                 Calendar toolbar, grids, detail, booking tones.
    dialogs.css                  Placeholder + real-booking dialogs/drawers.
    mobile.css                   Mobile shell + mobile calendar views.
    responsive.css               Shared breakpoints.

  lib/            (pure, framework-free helpers — safe to unit test)
    datetime.js                  Date / time / week / month parsing + formatting.
    format.js                    Currency, status text, clipboard.
    bookings.js                  Booking-shape helpers: derive times/labels/tone/
                                 meta, overlap detection, placeholder normalize +
                                 conflict annotation, day/week summaries.
    bookings.test.js             Vitest coverage for overlap, waitlist, stacks,
                                 revenue masking, summaries.
    navigation.js                Virtual-user nav visibility + permission checks.
    navigation.test.js           Vitest coverage for virtual-user nav/permissions.

  api/            (network + persistence boundary)
    config.js                    API URL builder using VITE_API_BASE_URL.
    client.js                    apiRequest: authed fetch wrapper; clears auth on 401.
    auth.js                      Login + localStorage auth persistence.
    virtualUsers.js              Worker-owned virtual user CRUD.
    placeholders.js              Optional browser-local placeholder escape hatch.
    calendar.js                  Calendar data load + in-memory TTL cache +
                                 captured booking-action endpoints (detail,
                                 receipt upload, reschedule lookups, price check).

  calendar/       (the Calendar feature)
    CalendarPage.jsx             Visible controller: wires hooks, views, detail
                                 panel, dialogs, and toolbar actions.
    useCalendarSelection.js      View/date/detail/summary selection state.
    useCalendarData.js           Calendar load/cache/refresh state.
    useCalendarScrollIndicators.js
                                 Day-view auto-scroll + hidden-count indicators.
    usePlaceholderActions.js     Placeholder create/update/delete workflows.
    useRealBookingActions.js     Real booking create/convert, payment, reschedule,
                                 cancel, and notes workflows.
    CalendarViews.jsx            Day/Week/Mobile grid renderers + hover tooltip.
    CalendarDetailPanel.jsx      Selected booking detail + day/week summary panel.
    BookingWriteDialog.jsx       Real-booking create/convert dialog.
    PaymentProofDialog.jsx       Receipt upload dialog.
    RescheduleBookingDialog.jsx  Reschedule dialog + slot/price checks.
    CancelBookingDialog.jsx      Cancel booking dialog.
    BookingNotesDialog.jsx       Booking notes dialog.
    SlotChoiceDialog.jsx         Placeholder-vs-real slot chooser.
    BookingActionSummary.jsx     Shared booking action header.
    PlaceholderBookingEditor.jsx Placeholder create/edit modal.
    forms.js                     Pure form-state + upstream-payload builders.
    forms.test.js                Vitest coverage for dates, courts, payloads.

  screens/
    LoginScreen.jsx              Credential login screen.
    VirtualUsersPage.jsx         Settings: virtual user management (master-only).
```

Other key files:

- `vite.config.js`: Vite config, base path, and local `/api` proxy.
- `docs/architecture.md`: Higher-level architecture and data-flow notes.
- `docs/api.md`: Backend endpoint assumptions and response-shape notes.
- `docs/visual-reference.md`: Current screenshots and design-language guidance for mockups.
- `docs/visual-reference/`: Live app screenshots for login and authenticated Calendar states.

## Environment

- `VITE_API_BASE_URL`: Worker origin for browser requests in local and built/static deployments.
- `PANEL_API_ORIGIN`: Optional backend target for the local Vite proxy.
- `MASTER_USERNAME`: Worker secret for the real upstream account allowed to manage virtual users; also used as the single virtual-login upstream account when no account pool is configured.
- `MASTER_PASSWORD`: Worker secret for the single-account virtual-login fallback when no account pool is configured.
- `UPSTREAM_ACCOUNTS_JSON`: Optional Worker secret containing a JSON array of upstream accounts used for virtual sessions, for example `[{"username":"admin-a@example.com","password":"..."},{"username":"admin-b@example.com","password":"..."}]`.
- `VIRTUAL_SESSION_TTL_SECONDS` / `VIRTUAL_SESSION_REMEMBER_TTL_SECONDS`: Optional Worker vars for panel-token lifetime. Defaults are 12 hours and 30 days.
- `WORKER_LOG_LEVEL`: Optional Worker log threshold (`debug`, `info`, `warn`, `error`, or `silent`). Defaults to `info`.
- `VITE_USE_LOCAL_PLACEHOLDERS`: Optional browser-local placeholder storage escape hatch. Leave unset for D1-backed testing.
- `VITE_BASE_PATH`: Vite base path for static deployments, for example `/pagi-pagi-padel-panel/`.

## Current Architecture Notes

- The UI is split into layered modules (see the Code Map above). `App.jsx` is now only the composition root and panel shell; feature code lives under `src/calendar/` and `src/screens/`, with reusable pure helpers under `src/lib/`, workflow hooks under `src/calendar/use*.js`, and the network/cache boundary under `src/api/`.
- Calendar data is loaded by `useCalendarData` through `loadCalendarData` (in `src/api/calendar.js`), which fetches courts, open hours, one schedule response per weekday, and D1-backed placeholder bookings. Calendar fetches are cached in-memory per auth/revenue scope for the `CALENDAR_DATA_CACHE_TTL_MS` window (in `src/constants.js`) per visible date; toolbar refresh, browser refresh, placeholder mutations, and real booking write actions force fresh data.
- Virtual account login uses an underscore-prefixed username, for example `_frontdesk`. The Worker validates the D1 virtual user, chooses the least-loaded configured upstream account using active non-expired virtual-session counts, reuses or refreshes that account's shared upstream token in the D1 `upstream_account_tokens` table, and returns only a Worker-issued panel token to the browser. If `UPSTREAM_ACCOUNTS_JSON` is unset, virtual login falls back to `MASTER_USERNAME` and `MASTER_PASSWORD`.
- Real logins also receive Worker-issued panel tokens. Multiple browser/device logins for the same real account create separate `real_sessions` rows, but all proxy through the single shared upstream token stored in `upstream_account_tokens`. Server-configured accounts can refresh that token with configured credentials. Unknown real accounts seed the shared token and a salted password hash after the first successful upstream login; later matching-password logins reuse the stored upstream token without creating another upstream login while the token is fresh.
- Workers Logs are enabled in `wrangler.toml`. Match `X-Panel-Request-ID` response headers to log `request_id` values in Cloudflare Workers Logs or real-time log tail output when debugging upstream proxy or virtual-login failures. Logs redact secret-looking keys and avoid request bodies.
- Virtual user management is master-only. The Worker rejects `/api/virtual-users` requests from virtual sessions and from real upstream accounts whose `/api/auth/me` identity does not match `MASTER_USERNAME`.
- Virtual user permissions control wrapper navigation and Worker endpoint authorization. The Worker maps virtual panel tokens to D1 session hashes before proxying upstream routes, rejects endpoints outside the user's allowed screens, swaps in the stored upstream token only after authorization, requires `Calendar booking` for real booking write actions, and masks calendar money fields unless `Calendar revenue` is granted.
- Settings also reads the master-only `/api/virtual-users/sessions` endpoint to show active virtual sessions, the virtual username/display name, assigned upstream account username, panel session expiry, and shared upstream token expiry/status. This endpoint must never return token values or token hashes.
- Placeholder create mode can select multiple courts; the frontend sends one D1 placeholder row per selected court. Multiple placeholders can share the same court/time as a stack, and placeholders that overlap a live booking are treated as waitlist holds. Editing remains one placeholder row at a time.
- Real booking create mode can target multiple dates; the frontend sends one captured upstream `/api/admin/court-booking` request per selected date for offline or registered users. Placeholder conversion stays single-date. Virtual users need `Calendar booking` for these real booking writes, but not `Calendar revenue`; hidden or blank booking prices are submitted as zero. Existing booking actions call the captured payment proof, mark-paid, reschedule, notes, and cancel endpoints.
- Virtual users can create and update placeholder bookings, but the Worker stamps `created_by_name`/`updated_by_name` from the virtual user's display name instead of trusting submitted PIC names. Deletes are owner-scoped: a virtual session may only delete a placeholder whose `created_by_name` matches its display name (the Worker returns `403` otherwise), and the calendar detail panel hides Delete on holds a virtual user does not own. Master/regular accounts can delete any placeholder.
- Authentication is stored in localStorage under `panel.auth` plus Nuxt-compatible keys used for parity checks.
- A `401` response clears stored auth in `apiRequest`.

## Change Guidance

- Prefer small, behavior-focused changes with `pnpm build` verification. Use `pnpm lint` for import/refactor safety and `pnpm test` for helper/payload changes.
- Put new code in the layer that matches it (see the Code Map):
  - Pure value helpers (dates, money, booking shapes) → `src/lib/*`. These are framework-free and the best first target for unit tests.
  - Anything that talks to the network or owns cached data → `src/api/*`.
  - A new full screen → `src/screens/NewScreen.jsx`, wired into `App.jsx`'s `PanelShell` switch.
  - Calendar UI → a focused file under `src/calendar/`; keep `CalendarPage.jsx` as the visible controller and avoid growing it back into a monolith.
  - Calendar stateful workflows → a focused `src/calendar/use*.js` hook.
- Respect the dependency direction (`App` → `screens`/`calendar` → `api`/`lib` → `constants`). Do not import a component from `lib/` or `api/`; that would create a cycle.
- Keep API field names aligned with the existing backend payloads. Do not rename backend-derived fields unless there is a mapping layer.
- Keep docs in sync with code changes. If a refactor changes the module layout, update this guide's Code Map, `README.md`, and relevant files in `docs/`.
- `vite build` does not catch every helper that is used but not imported (a free identifier can become a runtime crash). After moving code between modules, run `pnpm lint`; it includes `no-undef` and unresolved import checks.

## Visual And Mockup Guidance

Before generating mockup images, redesign concepts, or UI variants, review `docs/visual-reference.md` and the screenshots in `docs/visual-reference/`.

Mockups should stay close to the current app's design language unless the user explicitly asks for a larger redesign. Preserve the existing feel: off-white and pale green surfaces, deep green primary actions, compact admin density, restrained rounded controls, subtle borders, and muted operational status colors.

When the web app's visual design changes materially, update the visual-reference screenshots and `docs/visual-reference.md` in the same change or as soon as practical. This keeps future AI-generated mockups aligned with the real product instead of drifting into unrelated styles.

## Refactoring Permission

Future AI agents may freely refactor this guide, the README, and the docs when the code structure changes or when a better organization would help future work. They may also split components, utilities, and API modules when the current structure becomes inefficient for the requested change.

Good triggers for refactoring:

- A single file becomes hard to scan or grows another distinct responsibility — split it the same way `App.jsx`, `CalendarPage.jsx`, and the booking dialogs were split.
- A `src/lib/*` module accumulates enough logic to deserve its own tests.
- Multiple screens share shell, toolbar, or data-fetching patterns worth lifting into a shared component or hook.
- API assumptions move from guessed shapes to stable backend contracts.
- Documentation no longer matches the fastest way to understand the repo.

When refactoring, keep the repo AI-friendly by preserving a clear entrypoint, command list, the Code Map, the downward dependency direction, and the API assumptions.
