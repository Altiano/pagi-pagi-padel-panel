# API Notes

This frontend talks to the existing Pagi Pagi Padel panel API. The notes below document the endpoint assumptions visible in the current client code. Treat backend payloads as the source of truth when live API responses differ from this document.

## Local And Static Request Modes

Local development:

- Browser calls the Worker configured by `VITE_API_BASE_URL`.
- The Worker proxies ordinary `/api/*` requests upstream.
- The Worker stores `/api/placeholder-bookings` rows in Cloudflare D1.

Static deployment:

- Browser calls `VITE_API_BASE_URL` plus the request path.
- GitHub Pages uses the `PANEL_PROXY_ORIGIN` repository secret for `VITE_API_BASE_URL`.
- The `Deploy App` GitHub Actions workflow deploys the GitHub Pages frontend and Cloudflare Worker from the same resolved commit SHA. For rollback, re-run a previous workflow run while GitHub still offers it, or run the workflow manually from `main` with the `ref` input set to a commit SHA, branch, or tag.

Worker observability:

- Worker responses include `X-Panel-Request-ID`.
- Workers Logs are enabled in `wrangler.toml` with full request sampling.
- Worker logs are structured objects and include the matching `request_id`, route, upstream status, and safe upstream error message when available.
- `WORKER_LOG_LEVEL` controls verbosity (`debug`, `info`, `warn`, `error`, or `silent`) and defaults to `info`.
- Logs intentionally avoid request bodies, passwords, bearer tokens, and cookie values.

## Authentication

### `POST /api/auth/login`

Called from `login` in `src/api/auth.js`.

Request body:

```json
{
  "username": "admin@example.com",
  "password": "password",
  "remember": false
}
```

Expected regular-login response fields:

```json
{
  "token_type": "Bearer",
  "access_token": "token",
  "refresh_token": "refresh-token",
  "expires_in": 3600
}
```

The client stores this as `panel.auth` in localStorage and also writes Nuxt-compatible keys:

- `auth.strategy`
- `auth._token.local`
- `auth._token_expiration.local`
- `auth._refresh_token.local`

If `username` starts with `_`, the Worker treats it as a virtual account login. It strips the underscore prefix, validates the virtual user and password against D1, chooses a configured upstream account with the lowest active non-expired virtual-session count, ensures that account has a fresh shared upstream token in D1, and returns a Worker-issued panel session token:

```json
{
  "token_type": "Bearer",
  "access_token": "panel-session-token",
  "refresh_token": null,
  "expires_in": 3600,
  "upstream_account_username": "admin-a@example.com",
  "virtual_user": {
    "id": "virtual-user-id",
    "username": "frontdesk",
    "login_username": "_frontdesk",
    "display_name": "Front desk",
    "permissions": ["Calendar", "Calendar booking"],
    "is_active": true
  }
}
```

For virtual sessions, `access_token` is not an upstream token. It is a random panel token whose hash is stored in D1. `expires_in` is the panel-session lifetime, not the upstream token lifetime. The selected upstream username is returned only for debugging; upstream access and refresh tokens stay server-side in `upstream_account_tokens`, keyed by upstream username, and can be shared by multiple virtual sessions assigned to the same account. The account pool should be configured with the `UPSTREAM_ACCOUNTS_JSON` Worker secret. If it is unset, virtual login falls back to `MASTER_USERNAME` and `MASTER_PASSWORD`. These secrets must not be exposed as Vite variables.

For real logins, the Worker uses the same server-side token sharing model. It returns a per-device panel token, stores its hash in `real_sessions`, and maps later proxied API requests to the account's single reusable row in `upstream_account_tokens`. This lets device A and device B for the same real account share one upstream token. Server-configured accounts can refresh expired upstream tokens with configured credentials. Unknown real accounts seed the shared upstream token and a salted password hash after the first successful upstream login; later matching-password logins reuse the stored upstream token without creating a new upstream login while that token is fresh. If the cached password hash does not match, or the unknown account's stored upstream token has expired, the Worker falls back to a fresh upstream login.

### `GET /api/auth/me`

Called from `PanelShell` through `apiRequest`.

The client looks for:

- `data.name`
- `name`
- `data.mitra_id`, `mitra_id`, `data.mitraId`, or nested equivalents up to a limited depth

If no `mitraId` is found, `PanelShell` (in `src/App.jsx`) falls back to the hard-coded `FALLBACK_MITRA_ID` defined in `src/constants.js`.

## Calendar

### `GET /api/admin/mitra/court/:mitraId/list`

Called from `loadCalendarData`.

Expected shape:

```json
[
  {
    "id": "court-id",
    "name": "Court 1"
  }
]
```

The client accepts an array response. Non-array responses currently become an empty court list.

### `GET /api/admin/schedule/open-hour-date?mitra_id=:mitraId&date=:date`

Called from `loadCalendarData`.

Expected shape:

```json
{
  "data": {
    "open_hours": "06:00",
    "close_hours": "24:00"
  }
}
```

Fallback:

```json
{
  "open_hours": "06:00",
  "close_hours": "24:00"
}
```

The UI supports `HH:mm` and `HH.mm` time strings.

### `GET /api/admin/schedule-cal-courts?mitra_id=:mitraId&date=:date`

Called once for each day in the selected week.

Expected shape:

```json
{
  "lists": [
    {
      "id": "booking-id",
      "court_id": "court-id",
      "booking_owner": "Customer Name",
      "name": "Fallback Name",
      "time": "08:00-09:30",
      "duration": 90,
      "price": 250000,
      "booking_type": "online",
      "type": "booking",
      "booking_paid": true,
      "is_paylink": false,
      "notes": "",
      "trans_id": "transaction-id"
    }
  ]
}
```

Important booking fields used by the UI:

- `id`: React key and booking identity.
- `court_id`: groups bookings into court lanes.
- `booking_owner` or `name`: visible customer label.
- `time`: preferred source for start/end display and positioning.
- `start` and `end`: epoch fallback when `time` is missing.
- `duration`: preferred source for summary booked minutes.
- `price`: used for estimated revenue.
- `booking_type`, `type`, `booking_paid`, `is_paylink`, `notes`: booking color/tone decisions.
- `trans_id`: shown and copied from the detail panel.

`loadCalendarData` attaches `court_name` to each booking by matching `court_id` to the court list.

Calendar responses are cached in browser memory for the `CALENDAR_DATA_CACHE_TTL_MS` window (`src/constants.js`, currently 2 minutes) per auth/revenue scope, `mitraId`, data type, and date. This cache is deliberately not persisted. The dashboard refresh button and placeholder mutations bypass the cache, and a browser reload naturally starts with an empty cache.

The Calendar UI now uses the captured write endpoints below for direct real booking creation, placeholder-to-booking conversion, payment proof upload, mark-paid, reschedule, note edits, and cancellation. Each successful write refreshes calendar data so the visible schedule re-syncs from upstream and D1.

### `POST /api/admin/court-booking`

Captured from the upstream schedule create booking modal. This is the real admin/staff offline booking write endpoint, not the wrapper-owned placeholder flow.

Before booking a registered Courtside user, the upstream modal searches players as staff type:

```http
GET /api/admin/player/search-player-lists?per_page=100&search=:query
```

The response has `data`, `links`, and `meta`. Each player row includes `id` and `name` plus personal fields such as email, mobile, birthday, and avatar metadata. The booking form uses the selected row's `id` as `user_id`.

Representative offline-user request body:

```json
{
  "mitra_id": "mitra-id",
  "duration": 60,
  "date": "2026-07-16",
  "start_hours": "06.00",
  "court_id": "court-id",
  "harga": 185000,
  "diskon": 0,
  "notes": "altiano testing",
  "paid": true,
  "payment_method": "offline",
  "registered": false,
  "user_id": null,
  "offline_user": "Altiano",
  "is_recurring": false,
  "recurring_type": null,
  "end_date": null,
  "type": "booking",
  "add_ons": [],
  "voucher": null,
  "voucher2": null
}
```

`harga` may be `0` when staff creates an offline booking without a quoted price, or when a virtual user has `Calendar booking` permission but cannot view `Calendar revenue`.

The real booking create drawer can select additional dates. This does not use the upstream recurring fields; the frontend sends one independent `POST /api/admin/court-booking` request per selected date, with `is_recurring: false` on each request. The same court, start/end time, customer, price, payment method, receipt, and notes are reused for every selected date. If a transfer receipt is selected, the frontend attempts one receipt upload per successful create response that includes a `trans_id`. Client-side overlap warnings only cover selected dates that are currently loaded in calendar state; the upstream create response remains the final result for dates outside the visible loaded week.

Registered/online Courtside users use the same endpoint and mostly the same body, with these field differences:

```json
{
  "registered": true,
  "user_id": "player-id",
  "offline_user": null
}
```

For unregistered/offline users, the captured body used:

```json
{
  "registered": false,
  "user_id": null,
  "offline_user": "Altiano"
}
```

The voucher preflight also changes by user mode. Offline users send `owner_info=:typedName&is_courtside_user=false`; registered users send `owner_id=:playerId&is_courtside_user=true`.

Successful response:

```json
{
  "status": true,
  "trans_id": "transaction-id",
  "booking_id": "booking-id"
}
```

After a successful create, the upstream panel refreshes `GET /api/admin/schedule-cal-courts?mitra_id=:mitraId&date=:date`; the new row appears with `booking_type: "offline"`, `booking_paid: true`, `payment_method: "offline"`, `type: "booking-court"`, and the returned IDs as `id`/`trans_id`.

### Booking payment, notes, details, and attachments

Captured from the upstream schedule booking detail flow for an existing court booking.

Marking a booking as paid offline:

```http
POST /api/admin/pay-court-booking
```

```json
{
  "mitra_id": "mitra-id",
  "id": "booking-id",
  "payment_method": "offline"
}
```

Successful response:

```json
{
  "status": true
}
```

Changing booking notes:

```http
POST /api/admin/change-notes
```

```json
{
  "mitra_id": "mitra-id",
  "id": "booking-id",
  "type": "booking-court",
  "notes": "altiano testing"
}
```

Fetching booking detail:

```http
POST /api/admin/schedule-cal-courts-detail
```

```json
{
  "mitra_id": "mitra-id",
  "id": "booking-id",
  "type": "booking-court"
}
```

Uploading transfer receipt/proof attachments:

```http
POST /api/admin/schedule/attachments
Content-Type: multipart/form-data
```

Observed multipart fields:

- `trans_id`: transaction ID from the booking row or create response.
- `attachment_type[0]`: attachment type value selected by the upstream UI.
- `attachment_file[0]`: receipt/proof file, observed as `image/jpeg`.

Successful upload response:

```json
{
  "status": true,
  "message": "Attachments uploaded successfully",
  "data": [
    {
      "id": "attachment-id",
      "trans_id": "transaction-id",
      "attachment_type": "type",
      "attachment_path": "path",
      "attachment_name": "filename",
      "created_at": "2026-06-27T15:42:12.000000Z",
      "updated_at": "2026-06-27T15:42:12.000000Z"
    }
  ]
}
```

Fetching attachments and booking history:

```http
GET /api/admin/schedule/attachments/:transId
GET /api/admin/schedule/history/:bookingId
```

An attempted "offline user to registered/online user" edit in the captured booking detail flow only produced registered-player search requests and detail/history/schedule refreshes. No persisted owner/user mutation endpoint was observed; the latest captured detail still had `booking_owner: "Altiano"`, null user contact fields, and an empty `players` array.

### Booking reschedule and cancellation

Captured from the upstream schedule booking detail flow.

Listing available reschedule times:

```http
POST /api/admin/reschedule-court-time-lists
```

```json
{
  "mitra_id": "mitra-id",
  "id": "booking-id",
  "date": "2026-07-17",
  "court_id": "court-id"
}
```

Observed response shape:

```json
{
  "closed": false,
  "data": [
    { "time": "06.00" },
    { "time": "07.00" }
  ]
}
```

Checking the price impact of a reschedule:

```http
POST /api/admin/check-reschedule-court-price
```

```json
{
  "mitra_id": "mitra-id",
  "id": "booking-id",
  "date": "2026-07-17",
  "court_id": "court-id",
  "start_hours": "07.00",
  "duration": 60
}
```

The response includes `old_schedule`, `new_schedule`, and `payment_check`. The captured example moved from 185000 to 245000, with `payment_check.status: "underpayment"` and `adjustment_amount: 60000`.

Saving the reschedule:

```http
POST /api/admin/reschedule-court-time
```

```json
{
  "mitra_id": "mitra-id",
  "id": "booking-id",
  "date": "2026-07-17",
  "type": "booking-court",
  "court_id": "court-id",
  "start_hours": "07.00",
  "duration": 60,
  "adjust_payment": true,
  "adjust_payment_method": "offline"
}
```

Successful response:

```json
{
  "status": true
}
```

After rescheduling, the upstream panel refreshes `schedule-cal-courts`. The captured detail response for the rescheduled booking showed `has_adjustment: true`, `price_parent: 185000`, `price: 245000`, and `grand_total: 245000`.

Canceling a court booking:

```http
POST /api/admin/cancel-cal-court
```

```json
{
  "mitra_id": "mitra-id",
  "id": "booking-id",
  "type": "booking-court",
  "user_offline": null,
  "email_verified": true,
  "already_wd": false,
  "use_package": false,
  "email": "customer@example.com",
  "cancel_note": "reason",
  "is_recurring": false,
  "start_date": null,
  "end_date": null
}
```

The frontend follows the upstream detail flow by reading `POST /api/admin/schedule-cal-courts-detail` before canceling. If the enriched booking has an email, the cancel payload includes it. If the row is offline and no email is exposed, the frontend still sends the upstream-captured fallback email `a@a.com`, keeps `email_verified: true`, and sends `user_offline: null`; omitting `email` or sending the offline name in `user_offline` can make the upstream reject the request with `Email required !`.

Successful response:

```json
{
  "status": true,
  "data": null
}
```

After cancellation, the upstream panel refreshes `schedule-cal-courts`; the canceled booking was absent from the refreshed `lists` response.

## Placeholder Bookings

Placeholder bookings are stored by this wrapper and are not sent to the upstream API. They are intended for tentative holds while staff negotiate or wait for payment.

The Worker handles these routes locally before proxying other `/api/*` requests upstream:

- `GET /api/placeholder-bookings?mitra_id=:mitraId&from=:date&to=:date`
- `POST /api/placeholder-bookings`
- `PUT /api/placeholder-bookings/:id`
- `DELETE /api/placeholder-bookings/:id`

The Worker expects a Cloudflare D1 binding named `PLACEHOLDER_DB`.

Stored fields:

```json
{
  "id": "placeholder-id",
  "mitra_id": "mitra-id",
  "court_id": "court-id",
  "court_name": "Court 1",
  "date": "2026-06-23",
  "start_time": "08:00",
  "end_time": "09:30",
  "customer_name": "Customer Name",
  "customer_contact": "WhatsApp or email",
  "estimated_price": 450000,
  "status": "awaiting_payment",
  "notes": "Holding slot while customer confirms payment.",
  "created_by_name": "PIC name entered manually",
  "updated_by_name": "PIC name entered manually",
  "confirmed_booking_id": "",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

The frontend maps these rows into booking-like calendar entries with `is_placeholder: true`, `booking_type: "placeholder"`, and an amber dashed visual treatment.

Placeholder conversion currently happens client-side from the placeholder detail panel:

1. The frontend posts a real upstream booking to `POST /api/admin/court-booking`, using the placeholder court/date/start/duration and either an offline customer name or selected registered player ID. If the placeholder price is hidden or the booking price is blank, the frontend sends `harga: 0`.
2. If staff selected a transfer receipt and the upstream response includes `trans_id`, the frontend uploads it to `POST /api/admin/schedule/attachments` as multipart form data.
3. After the upstream booking exists, the frontend deletes the local placeholder with `DELETE /api/placeholder-bookings/:id` and refreshes calendar data so the real schedule row replaces the local hold.

`confirmed_booking_id` remains stored on placeholder rows for future server-side/audit linking, but the current visible conversion cleanup is the soft-delete step after upstream create succeeds.

The placeholder form can create the same tentative hold across multiple courts. The backend contract remains one row per request; the frontend sends one `POST /api/placeholder-bookings` request per selected court. Editing remains a single-row `PUT`.

`POST` and `PUT` intentionally allow overlap. Multiple D1 placeholders for the same `mitra_id`, `court_id`, `date`, and time range are valid and render as a placeholder stack. A placeholder may also overlap a live upstream booking; the frontend treats that row as a waitlist hold instead of an available slot.

When calendar data is loaded, the frontend compares live upstream bookings and local placeholders. If a live booking overlaps a placeholder hold, the live booking remains visually primary and shows a `+N waitlist` badge. The placeholder is marked as waitlist/blocked, and conversion is disabled until the live booking no longer overlaps. Local placeholders do not block real booking creation or conversion; only live upstream bookings do.

## Virtual Users

Virtual users are stored by this wrapper and can only be managed by a real session for the configured `MASTER_USERNAME`. They provide wrapper-level login identities while upstream calls use the upstream account assigned to that virtual session.

The Worker handles these routes locally before proxying other `/api/*` requests upstream:

- `GET /api/virtual-users`
- `GET /api/virtual-users/sessions`
- `POST /api/virtual-users`
- `PUT /api/virtual-users/:id`
- `DELETE /api/virtual-users/:id`

Create/update payload:

```json
{
  "username": "frontdesk",
  "display_name": "Front desk",
  "password": "virtual-password",
  "permissions": ["Calendar", "Calendar booking", "Setting"],
  "is_active": true
}
```

For updates, omit or blank `password` to keep the current password. Passwords are stored as salted SHA-256 hashes in D1. Permissions control visible navigation in the wrapper UI and Worker authorization before virtual sessions reach proxied upstream endpoints.

The Worker records virtual-issued panel token hashes in D1. Each virtual session row stores the assigned upstream account username. A dedicated `upstream_account_tokens` table stores one reusable upstream access/refresh token per configured upstream username. On proxy requests, the Worker maps the panel token back to the virtual user, enforces permissions, reuses or refreshes the assigned account token by re-login when it is near expiry, and only then sends the stored upstream token to the upstream API. Non-master upstream accounts are rejected from virtual-user management after the Worker verifies `/api/auth/me` against `MASTER_USERNAME`.

`GET /api/virtual-users/sessions` is master-only and returns active, non-expired virtual panel sessions for debugging account distribution. It does not return panel token hashes or upstream token values.

Representative row:

```json
{
  "virtual_user_id": "virtual-user-id",
  "username": "frontdesk",
  "login_username": "_frontdesk",
  "display_name": "Front desk",
  "is_active": true,
  "upstream_account_username": "admin-a@example.com",
  "session_expires_at": "2026-06-30T22:00:00.000Z",
  "session_created_at": "2026-06-30T10:00:00.000Z",
  "session_updated_at": "2026-06-30T10:00:00.000Z",
  "remember": false,
  "upstream_token_expires_at": "2026-06-30T11:00:00.000Z",
  "upstream_token_updated_at": "2026-06-30T10:00:00.000Z",
  "upstream_token_status": "fresh"
}
```

Virtual endpoint authorization:

- `Dashboard`: dashboard, mitra info/notifications, and dashboard transaction summary/list routes from the captured API map.
- `Calendar`: schedule/open-hour, schedule calendar courts, mitra court list, mitra operation hours, and `/api/placeholder-bookings`.
- `Calendar booking`: real booking create/convert support, booking payment, notes, detail, attachment, reschedule, cancel, and registered-player search routes. Virtual users also need `Calendar` because these actions operate inside the Calendar screen.
- `Court Prices`: `/api/admin/services`.
- `Event`: `/api/admin/event`.
- `Coach`: `/api/admin/coach`.
- `Add On`: `/api/admin/addons`.
- `Customers`: player, voucher, promotion, membership, and mitra discount routes.
- `Setting`: admin user routes and image lookup.
- `Calendar revenue`: data permission, not a screen. Without it, the Worker strips money fields from calendar schedule responses and placeholder responses for virtual sessions. Booking writes require `Calendar` plus `Calendar booking`, not `Calendar revenue`, and hidden or blank prices are sent as zero.

Placeholder audit fields are also server-owned for virtual sessions. On create, the Worker sets both `created_by_name` and `updated_by_name` to the virtual user's display name. On update, it preserves the original creator and sets `updated_by_name` to the virtual user's display name.

## Error Handling

- `apiRequest` throws `payload.message`, `payload.error`, or `Request failed with HTTP <status>`.
- `401` clears stored auth.
- Calendar load errors are shown in the Calendar screen while preserving the page shell.

## Future Maintenance

When the backend contract becomes better documented, replace inferred examples in this file with real response samples. If a future agent introduces a typed mapping layer, update this document to distinguish raw backend fields from frontend model fields.
