# Architecture

Pagi Pagi Padel Panel is a React + Vite admin frontend. The code is organized in
layers with a strictly downward dependency direction (no import cycles):

- `App.jsx` — composition root + panel shell.
- `src/screens/` and `src/calendar/` — feature UI.
- `src/api/` — network + cache boundary.
- `src/lib/` — pure, framework-free helpers.
- `src/constants.js`, `src/hooks.js` — shared constants and React hooks.

See the Code Map in `AGENTS.md` for a one-line description of every file. The
sections below describe how data flows through those layers.

## Runtime Flow

1. `src/main.jsx` mounts the React app.
2. `App` checks `getStoredAuth()` from `src/api/auth.js`.
3. If there is no valid auth object, `LoginScreen` is shown.
4. Login posts to `/api/auth/login`, stores auth in localStorage, then renders the panel.
5. If the login username starts with `_`, the Worker validates a D1-backed virtual user, assigns the least-loaded configured upstream account, reuses or refreshes that account's shared upstream token in D1, and returns a Worker-issued panel token plus virtual-user metadata.
6. `PanelShell` loads `/api/auth/me`, derives the display name and `mitraId`, applies virtual-user navigation visibility, and renders the active screen.
7. Calendar is the only fully wired screen today. Settings exposes virtual user management and active virtual-session upstream account mapping only when the Worker confirms the real master account is signed in. Other navigation items render placeholders.

Placeholder bookings and virtual users are wrapper-owned data models. They are stored in Cloudflare D1 through the Worker. Placeholder bookings are merged into Calendar responses on the frontend; staff can later convert a placeholder into a real upstream court booking, optionally uploading a payment receipt, after which the local placeholder is deleted. Virtual users receive Worker-issued panel tokens. Their session rows store the assigned upstream username, while reusable upstream tokens stay server-side in `upstream_account_tokens`, keyed by upstream account. Only a real `MASTER_USERNAME` session can manage virtual users.

Virtual permissions are enforced twice:

- The React shell filters visible screens, hides calendar money when `Calendar revenue` is absent, and shows real booking write actions only when `Calendar booking` is present. Calendar booking writes require `Calendar` plus `Calendar booking`; when a price is hidden or left blank, the frontend sends `harga: 0`.
- The Worker maps virtual bearer tokens back to D1 virtual sessions before proxying, rejects upstream endpoints outside the user's allowed screens, swaps in the server-side upstream token, strips calendar money fields without `Calendar revenue`, and stamps virtual placeholder audit names from the virtual user's display name.

## API Flow

- `src/api/config.js` builds request URLs.
- `src/api/client.js` wraps `fetch`, adds `Accept` and `Authorization` headers, reads JSON/text bodies, and clears auth on `401`.
- `src/api/auth.js` handles login and localStorage persistence. For virtual users, the stored bearer token is the Worker-issued panel token rather than an upstream token.
- `src/api/virtualUsers.js` reads and mutates Worker-owned virtual users.
- `vite.config.js` can proxy local `/api` requests to `PANEL_API_ORIGIN`, but the normal local setup uses `VITE_API_BASE_URL` to call the deployed Worker.

## Calendar Flow

`CalendarPage` (`src/calendar/CalendarPage.jsx`) is the visible controller: it
wires toolbar actions, grids, detail panels, dialogs, and the focused hooks that
own stateful workflows.

- `useCalendarSelection.js` owns `view`, `selectedDate`, selected booking, summary panel state, and selected week days.
- `useCalendarData.js` owns load/cache/refresh state and calls `loadCalendarData`.
- `useCalendarScrollIndicators.js` owns day-view auto-scroll and hidden booking indicators.
- `usePlaceholderActions.js` owns placeholder create/update/delete workflows.
- `useRealBookingActions.js` owns real booking create/convert, receipt, mark-paid, reschedule, cancel, and notes workflows.

When `mitraId`, `selectedDate`, or the refresh key changes, `useCalendarData`
calls `loadCalendarData`.

`loadCalendarData` (`src/api/calendar.js`) fetches:

- court list for the current `mitraId`
- open hours for every date in the selected week
- schedule entries for every date in the selected week
- local placeholder bookings for every date in the selected week

Then it attaches court names to booking rows, maps placeholders into booking-like entries, and returns normalized calendar state.

Calendar data uses a module-level in-memory cache (in `src/api/calendar.js`) with a TTL set by `CALENDAR_DATA_CACHE_TTL_MS` in `src/constants.js`. Cache keys include the current auth/revenue visibility scope, `mitraId`, data type, and date so virtual-user revenue masking does not bleed across sessions. Selecting another already-cached day in the same week reuses cached open hours, schedule rows, and placeholders. The toolbar refresh button, placeholder create/update/delete, and real booking write actions increment the refresh key and bypass the cache; a browser reload also clears the cache because it is not persisted.

Placeholder create mode can target multiple courts at once. The frontend fans that out into one `/api/placeholder-bookings` POST per selected court. Multiple placeholders can share the same court/time; the Calendar renders those as a placeholder stack. If a placeholder overlaps a live upstream booking, the frontend treats it as a waitlist hold and disables conversion until the live booking moves or is canceled. Edit mode updates a single placeholder row.

Real booking create mode posts to the captured upstream `/api/admin/court-booking` endpoint for either offline customers or selected registered players. The create drawer can target multiple selected dates; the frontend fans that out into one upstream create request per date while reusing the same court, time, customer, price, receipt, and notes. Virtual users need `Calendar booking` for real booking create/convert and existing booking write actions, while booking prices are optional and may be submitted as zero for users without `Calendar revenue`. Existing real booking detail actions can mark paid, upload a transfer receipt, reschedule after checking available times/pricing, edit notes, and cancel through the captured upstream write endpoints.

The Worker allows placeholder overlaps so staff can capture competing tentative holds and waitlists. Real booking writes still treat live upstream bookings as exclusive, while local placeholders do not block real booking creation. On read, the frontend annotates placeholder/live-booking overlap as waitlist state, keeps the live booking visually primary, and groups same-slot placeholder holds into stack cards.

## UI Structure

Components by file (`AGENTS.md` has the full Code Map):

- `src/App.jsx` — `App`, `PanelShell`, `DesktopSidebar`, `MobileAppShell`, `PlaceholderPage`, `NoAccessPage`.
- `src/screens/LoginScreen.jsx` — `LoginScreen`.
- `src/screens/VirtualUsersPage.jsx` — `VirtualUsersPage`, `VirtualUserEditor`.
- `src/calendar/CalendarPage.jsx` — `CalendarPage` (visible controller/wiring).
- `src/calendar/useCalendarData.js` — calendar load/cache/refresh hook.
- `src/calendar/useCalendarSelection.js` — calendar view/date/detail selection hook.
- `src/calendar/useCalendarScrollIndicators.js` — day-view scroll helper hook.
- `src/calendar/usePlaceholderActions.js` — placeholder write workflow hook.
- `src/calendar/useRealBookingActions.js` — real booking write workflow hook.
- `src/calendar/CalendarViews.jsx` — `DayCalendar`, `WeekCalendar`, `WeekDayColumn`, `MobileDayAgenda`, `MobileWeekCalendar`, `CalendarBookingButton`, `CalendarCardTooltip`.
- `src/calendar/CalendarDetailPanel.jsx` — `CalendarDetailPanel`.
- `src/calendar/BookingWriteDialog.jsx` — real booking create/convert dialog.
- `src/calendar/PaymentProofDialog.jsx` — receipt upload dialog.
- `src/calendar/RescheduleBookingDialog.jsx` — reschedule dialog with slot/price checks.
- `src/calendar/CancelBookingDialog.jsx` — cancel booking dialog.
- `src/calendar/BookingNotesDialog.jsx` — booking notes dialog.
- `src/calendar/SlotChoiceDialog.jsx` — placeholder-vs-real slot chooser.
- `src/calendar/BookingActionSummary.jsx` — shared booking action header.
- `src/calendar/PlaceholderBookingEditor.jsx` — `PlaceholderBookingEditor`.

The former in-file helper functions now live in `src/lib/` (date/time, formatting, booking shapes, navigation), `src/calendar/forms.js` (form-state + payload builders), and `src/api/calendar.js` (data loading, cache, booking-action endpoints).

## Styling

`src/styles.css` is the CSS entrypoint and imports grouped global styles from
`src/styles/`:

- `base.css` — tokens, element defaults, shared form/button states.
- `shell.css` — panel shell, sidebar, and placeholder screens.
- `login.css` — login screen.
- `virtual-users.css` — virtual user management.
- `calendar.css` — calendar toolbar, grids, detail panel, and booking tones.
- `dialogs.css` — placeholder and real-booking dialogs/drawers.
- `mobile.css` — mobile app shell and mobile calendar views.
- `responsive.css` — shared responsive breakpoints.

Keep selectors grouped by feature when adding styles. Class names remain global
for now, so avoid broad selectors that could unintentionally affect another
screen.

## Refactoring Guidance

`App.jsx` was originally one ~4,300-line file; it has been split into the layered
modules described above. When extending the app, add code to the matching layer
rather than growing one file back into a monolith:

- Pure value logic → `src/lib/*` (and add tests there).
- Network/cache code → `src/api/*`.
- A new screen → `src/screens/*`, wired into `PanelShell` in `App.jsx`.
- Calendar UI → a focused file under `src/calendar/`.

Keep the dependency direction downward: components may import from `api/`, `lib/`,
`constants.js`, and `hooks.js`, but those lower layers must not import components.
This is what keeps the graph cycle-free.

`vite build` verifies that named imports resolve, but it does **not** catch every
helper that is referenced without being imported (it can become a runtime
`ReferenceError`). Run `pnpm lint` after moving code between files; it includes
`no-undef` and unresolved import checks.

When refactoring, also update:

- `AGENTS.md` (especially the Code Map)
- `README.md`
- this file
- `docs/api.md` if API boundaries change

## Testing Notes

The current verification suite is:

```sh
pnpm lint
pnpm test
pnpm build
```

Vitest currently covers booking helpers, calendar form payload builders, and
virtual-user navigation helpers. Add focused tests beside pure modules when
changing `src/lib/*` or `src/calendar/forms.js`; broaden coverage when a change
touches shared behavior or backend payload contracts.
