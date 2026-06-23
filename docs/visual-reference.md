# Visual Reference

Use these screenshots as the current design-language reference when discussing, sketching, or generating mockups for this app.

The goal is not to copy every pixel. The goal is to keep new mockups aligned with the existing product's visual system:

- soft off-white and pale green backgrounds
- deep green primary actions
- compact admin-panel density
- rounded but restrained controls
- left sidebar navigation on desktop
- clean card/panel surfaces with subtle borders
- Avenir/Helvetica-style typography
- booking/status color accents that stay muted and operational

## Screenshots

| State | Desktop | Mobile |
| --- | --- | --- |
| Login | `docs/visual-reference/login-desktop.jpg` | `docs/visual-reference/login-mobile.jpg` |
| Authenticated Calendar | `docs/visual-reference/panel-calendar-desktop.jpg` | `docs/visual-reference/panel-calendar-mobile.jpg` |

## Capture Notes

- Captured from the live Vite app at `http://localhost:5173/`.
- Desktop viewport: `1280x720`.
- Mobile viewport: `390x844`.
- Authenticated Calendar screenshots use seeded local browser auth for visual-reference purposes.
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
