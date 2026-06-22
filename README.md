# Pagi Pagi Padel Panel

React/Vite frontend client for the Pagi Pagi Padel admin panel.

## Commands

```sh
pnpm install
pnpm dev
pnpm build
```

The dev server proxies `/api/*` to the configured panel API origin, so the browser can call the existing backend through same-origin local requests.

## GitHub Pages

This app can be deployed as a static Vite bundle. The GitHub Actions workflow builds with:

```sh
VITE_BASE_PATH=/pagi-pagi-padel-panel/
VITE_API_BASE_URL=<panel-api-origin>
```

The static UI will load from GitHub Pages, but authenticated API calls still depend on the panel API allowing browser requests from the Pages origin. If the backend does not allow that CORS origin, keep using the local Vite proxy or add a small API proxy for production.
