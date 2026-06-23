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

Expected response fields:

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

### `GET /api/auth/me`

Called from `PanelShell` through `apiRequest`.

The client looks for:

- `data.name`
- `name`
- `data.mitra_id`, `mitra_id`, `data.mitraId`, or nested equivalents up to a limited depth

If no `mitraId` is found, the current code falls back to a hard-coded mitra ID in `src/App.jsx`.

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

The frontend maps these rows into booking-like calendar entries with `is_placeholder: true`, `booking_type: "placeholder"`, and an amber dashed visual treatment. `confirmed_booking_id` is reserved for a future flow that creates a real upstream booking after payment.

## Error Handling

- `apiRequest` throws `payload.message`, `payload.error`, or `Request failed with HTTP <status>`.
- `401` clears stored auth.
- Calendar load errors are shown in the Calendar screen while preserving the page shell.

## Future Maintenance

When the backend contract becomes better documented, replace inferred examples in this file with real response samples. If a future agent introduces a typed mapping layer, update this document to distinguish raw backend fields from frontend model fields.
