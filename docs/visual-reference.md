# Visual Reference

Use these screenshots as the current design-language reference when discussing, sketching, or generating mockups for this app.

The goal is not to copy every pixel. The goal is to keep new mockups aligned with the existing product's visual system:

- soft off-white and pale green backgrounds
- deep green primary actions
- compact admin-panel density
- rounded but restrained controls
- left sidebar navigation on desktop
- clean card/panel surfaces with subtle borders
- Avenir/Helvetica-style typography using the shared scale in `docs/typography.md`
- booking/status color accents that stay muted and operational
- login as a branded operations entry point: clear Pagi Pagi Padel identity,
  compact credential card, and no marketing-style hero copy

The mobile app view intentionally reads as a native app rather than a responsive web page (since v0.4.0):

- installable PWA (standalone display, themed status bar, padel-ball app icon)
- surfaces float on the background with soft shadows/hairlines instead of outlined cards
- iOS-style segmented control (gray track, raised white thumb)
- a 7-day tappable day strip under the toolbar in Day view (selected day = solid green chip)
- Material-style bottom tab bar: active tab gets a pale green pill behind the icon only
- bottom sheets (booking detail, editors, slot chooser) slide up with a grab handle
- touch press states (scale/darken) everywhere; hover effects only on pointer devices

The current mobile screenshots below predate this revamp; refresh them from an authenticated session when practical.

## Screenshots

| State | Desktop | Mobile |
| --- | --- | --- |
| Login | `docs/visual-reference/login-desktop.jpg` | `docs/visual-reference/login-mobile.jpg` |
| Calendar - Week view | `docs/visual-reference/panel-calendar-week-desktop.png` | `docs/visual-reference/panel-calendar-week-mobile.jpg` |
| Calendar - Day view | `docs/visual-reference/panel-calendar-day-desktop.png` | `docs/visual-reference/panel-calendar-day-mobile.jpg` |
| Calendar - Booking detail | Not captured | `docs/visual-reference/panel-calendar-detail-mobile.jpg` |

## Capture Notes

- Captured from the live Vite app at `http://localhost:5173/`, `http://localhost:5174/`, or `http://127.0.0.1:5173/`.
- Desktop screenshots use the active Chrome viewport from the authenticated local app.
- Mobile viewport: `390x844`.
- Authenticated Calendar screenshots use local browser auth for visual-reference purposes.
- If the backend is unavailable during capture, the Calendar reference may show an API error state. That is still useful for layout, typography, spacing, colors, sidebar, toolbar, and panel styling.

## When To Update

Update these screenshots whenever a change materially affects:

- color palette
- typography
- spacing scale
- border radius or surface treatment
- navigation layout
- Calendar layout
- login screen design
- mobile responsive behavior

Future AI agents may replace, rename, or reorganize these images and this document if the app is re-architected. Keep the references easy to find from `AGENTS.md` and `README.md`.

## Suggested Refresh Workflow

```sh
pnpm dev
```

Then capture the current app states from the local Vite URL and replace the files in `docs/visual-reference/`.

After refreshing images, update this file if the filenames, states, or capture notes changed.
