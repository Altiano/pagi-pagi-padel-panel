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
5. If the login username starts with `_`, the Worker validates a D1-backed virtual user and signs into upstream with the configured master account before returning the upstream token plus virtual-user metadata.
6. `PanelShell` loads `/api/auth/me`, derives the display name and `mitraId`, applies virtual-user navigation visibility, and renders the active screen.
7. Calendar is the only fully wired screen today. Settings exposes virtual user management only when the Worker confirms the real master account is signed in. Other navigation items render placeholders.

Placeholder bookings and virtual users are wrapper-owned data models. They are stored in Cloudflare D1 through the Worker. Placeholder bookings are merged into Calendar responses on the frontend; staff can later convert a placeholder into a real upstream court booking, optionally uploading a payment receipt, after which the local placeholder is deleted. Virtual users allow multiple wrapper logins to share one real upstream account, but only a real `MASTER_USERNAME` session can manage them.

Virtual permissions are enforced twice:

- The React shell filters visible screens, hides calendar money when `Calendar revenue` is absent, and shows real booking write actions only when `Calendar booking` is present. Calendar booking writes require `Calendar` plus `Calendar booking`; when a price is hidden or left blank, the frontend sends `harga: 0`.
- The Worker maps bearer tokens back to D1 virtual sessions before proxying, rejects upstream endpoints outside the user's allowed screens, strips calendar money fields without `Calendar revenue`, and stamps virtual placeholder audit names from the virtual user's display name.

## API Flow

- `src/api/config.js` builds request URLs.
- `src/api/client.js` wraps `fetch`, adds `Accept` and `Authorization` headers, reads JSON/text bodies, and clears auth on `401`.
- `src/api/auth.js` handles login and localStorage persistence.
- `src/api/virtualUsers.js` reads and mutates Worker-owned virtual users.
- `vite.config.js` can proxy local `/api` requests to `PANEL_API_ORIGIN`, but the normal local setup uses `VITE_API_BASE_URL` to call the deployed Worker.

## Calendar Flow

`CalendarPage` (`src/calendar/CalendarPage.jsx`) owns calendar state:

- `view`: `day` or `week`.
- `selectedDate`: `YYYY-MM-DD` date string.
- `refreshKey`: incremented to force-refresh current calendar data.
- `state`: courts, open hours, bookings grouped by date, loading, and error state.
- `selectedBooking`: booking shown in the detail panel.

When `mitraId`, `selectedDate`, or `refreshKey` changes, `CalendarPage` calls `loadCalendarData`.

`loadCalendarData` (`src/api/calendar.js`) fetches:

- court list for the current `mitraId`
- open hours for every date in the selected week
- schedule entries for every date in the selected week
- local placeholder bookings for every date in the selected week

Then it attaches court names to booking rows, maps placeholders into booking-like entries, and returns normalized calendar state.

Calendar data uses a module-level in-memory cache (in `src/api/calendar.js`) with a TTL set by `CALENDAR_DATA_CACHE_TTL_MS` in `src/constants.js`. Cache keys include the current auth/revenue visibility scope, `mitraId`, data type, and date so virtual-user revenue masking does not bleed across sessions. Selecting another already-cached day in the same week reuses cached open hours, schedule rows, and placeholders. The toolbar refresh button and placeholder create/update/delete increment `refreshKey` and bypass the cache; a browser reload also clears the cache because it is not persisted.

Placeholder create mode can target multiple courts at once. The frontend fans that out into one `/api/placeholder-bookings` POST per selected court. Multiple placeholders can share the same court/time; the Calendar renders those as a placeholder stack. If a placeholder overlaps a live upstream booking, the frontend treats it as a waitlist hold and disables conversion until the live booking moves or is canceled. Edit mode updates a single placeholder row.

Real booking create mode posts to the captured upstream `/api/admin/court-booking` endpoint for either offline customers or selected registered players. The create drawer can target multiple selected dates; the frontend fans that out into one upstream create request per date while reusing the same court, time, customer, price, receipt, and notes. Virtual users need `Calendar booking` for real booking create/convert and existing booking write actions, while booking prices are optional and may be submitted as zero for users without `Calendar revenue`. Existing real booking detail actions can mark paid, upload a transfer receipt, reschedule after checking available times/pricing, edit notes, and cancel through the captured upstream write endpoints.

The Worker allows placeholder overlaps so staff can capture competing tentative holds and waitlists. Real booking writes still treat live upstream bookings as exclusive, while local placeholders do not block real booking creation. On read, the frontend annotates placeholder/live-booking overlap as waitlist state, keeps the live booking visually primary, and groups same-slot placeholder holds into stack cards.

## UI Structure

Components by file (`AGENTS.md` has the full Code Map):

- `src/App.jsx` — `App`, `PanelShell`, `DesktopSidebar`, `MobileAppShell`, `PlaceholderPage`, `NoAccessPage`.
- `src/screens/LoginScreen.jsx` — `LoginScreen`.
- `src/screens/VirtualUsersPage.jsx` — `VirtualUsersPage`, `VirtualUserEditor`.
- `src/calendar/CalendarPage.jsx` — `CalendarPage` (the controller that holds calendar state and write actions).
- `src/calendar/CalendarViews.jsx` — `DayCalendar`, `WeekCalendar`, `WeekDayColumn`, `MobileDayAgenda`, `MobileWeekCalendar`, `CalendarBookingButton`, `CalendarCardTooltip`.
- `src/calendar/CalendarDetailPanel.jsx` — `CalendarDetailPanel`.
- `src/calendar/BookingDialogs.jsx` — `BookingWriteDialog` (create/convert), `PaymentProofDialog`, `RescheduleBookingDialog`, `CancelBookingDialog`, `BookingNotesDialog`, `SlotChoiceDialog`, `BookingActionSummary`.
- `src/calendar/PlaceholderBookingEditor.jsx` — `PlaceholderBookingEditor`.

The former in-file helper functions now live in `src/lib/` (date/time, formatting, booking shapes, navigation), `src/calendar/forms.js` (form-state + payload builders), and `src/api/calendar.js` (data loading, cache, booking-action endpoints).

## Styling

All app styles live in `src/styles.css`. The stylesheet defines global tokens, login styles, shell/sidebar styles, calendar layout, booking colors, responsive behavior, and utility states.

If the UI grows, consider splitting styles by feature or moving repeated UI patterns into components before adding more selectors to the global file.

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

`vite build` verifies that named imports resolve, but it does **not** catch a
helper that is referenced without being imported (it becomes a runtime
`ReferenceError`). After moving code between files, confirm imports by grepping the
symbol or by loading the page and watching the browser console.

When refactoring, also update:

- `AGENTS.md` (especially the Code Map)
- `README.md`
- this file
- `docs/api.md` if API boundaries change

## Testing Notes

There are no automated tests yet. The current verification command is:

```sh
pnpm build
```

The pure helpers now live in `src/lib/` (and `src/calendar/forms.js`), which makes
them straightforward to unit test in isolation. Recommended first targets:

- `src/lib/datetime.js` — date shifting, week generation, time parsing.
- `src/lib/bookings.js` — booking start/end/duration, overlap, day/week summaries, placeholder normalize/annotate.
- `src/lib/format.js` — currency/status formatting.
- `src/calendar/forms.js` — form-state and `buildCourtBookingPayload` / `buildCancelBookingPayload`.
- `src/api/config.js` — API URL construction.
