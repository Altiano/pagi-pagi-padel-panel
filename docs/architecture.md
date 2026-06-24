# Architecture

Pagi Pagi Padel Panel is a React + Vite admin frontend. It is currently compact by design: most UI and calendar logic lives in `src/App.jsx`, with API helpers separated under `src/api/`.

## Runtime Flow

1. `src/main.jsx` mounts the React app.
2. `App` checks `getStoredAuth()` from `src/api/auth.js`.
3. If there is no valid auth object, `LoginScreen` is shown.
4. Login posts to `/api/auth/login`, stores auth in localStorage, then renders the panel.
5. If the login username starts with `_`, the Worker validates a D1-backed virtual user and signs into upstream with the configured master account before returning the upstream token plus virtual-user metadata.
6. `PanelShell` loads `/api/auth/me`, derives the display name and `mitraId`, applies wrapper-level virtual-user navigation visibility, and renders the active screen.
7. Calendar is the only fully wired screen today. Settings now manages virtual users. Other navigation items render placeholders.

Placeholder bookings and virtual users are wrapper-owned data models. They are stored in Cloudflare D1 through the Worker. Placeholder bookings are merged into Calendar responses on the frontend and deliberately do not call the upstream booking API until a future confirmation/payment flow is implemented. Virtual users allow multiple wrapper logins to share one real upstream account.

## API Flow

- `src/api/config.js` builds request URLs.
- `src/api/client.js` wraps `fetch`, adds `Accept` and `Authorization` headers, reads JSON/text bodies, and clears auth on `401`.
- `src/api/auth.js` handles login and localStorage persistence.
- `src/api/virtualUsers.js` reads and mutates Worker-owned virtual users.
- `vite.config.js` can proxy local `/api` requests to `PANEL_API_ORIGIN`, but the normal local setup uses `VITE_API_BASE_URL` to call the deployed Worker.

## Calendar Flow

`CalendarPage` owns calendar state:

- `view`: `day` or `week`.
- `selectedDate`: `YYYY-MM-DD` date string.
- `refreshKey`: incremented to reload current calendar data.
- `state`: courts, open hours, bookings grouped by date, loading, and error state.
- `selectedBooking`: booking shown in the detail panel.

When `mitraId`, `selectedDate`, or `refreshKey` changes, `CalendarPage` calls `loadCalendarData`.

`loadCalendarData` fetches:

- court list for the current `mitraId`
- open hours for the selected date
- schedule entries for every date in the selected week
- local placeholder bookings for the selected week

Then it attaches court names to booking rows, maps placeholders into booking-like entries, and returns normalized calendar state.

## UI Structure

Current component structure inside `src/App.jsx`:

- `App`
- `LoginScreen`
- `PanelShell`
- `VirtualUsersPage`
- `PlaceholderPage`
- `CalendarPage`
- `DayCalendar`
- `WeekCalendar`
- `CalendarDetailPanel`
- `PlaceholderBookingEditor`

The rest of the file contains date, time, booking, formatting, summary, and clipboard helpers.

## Styling

All app styles live in `src/styles.css`. The stylesheet defines global tokens, login styles, shell/sidebar styles, calendar layout, booking colors, responsive behavior, and utility states.

If the UI grows, consider splitting styles by feature or moving repeated UI patterns into components before adding more selectors to the global file.

## Refactoring Guidance

The current single-file `App.jsx` is acceptable while the app is small. Future agents may split it when doing so makes implementation faster, safer, or easier to verify.

Good extraction targets:

- `src/screens/LoginScreen.jsx`
- `src/screens/PanelShell.jsx`
- `src/calendar/CalendarPage.jsx`
- `src/calendar/DayCalendar.jsx`
- `src/calendar/WeekCalendar.jsx`
- `src/calendar/CalendarDetailPanel.jsx`
- `src/calendar/api.js`
- `src/calendar/utils.js`

If helpers move to `src/calendar/utils.js`, add tests around the pure functions first or in the same change.

When refactoring, also update:

- `AGENTS.md`
- `README.md`
- this file
- `docs/api.md` if API boundaries change

## Testing Notes

There are no automated tests yet. The current verification command is:

```sh
pnpm build
```

Recommended first tests:

- date shifting and week generation
- time parsing
- booking start/end/duration helpers
- day and week summary calculations
- API URL construction
