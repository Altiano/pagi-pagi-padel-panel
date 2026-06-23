# Pagi Pagi Padel Panel

React/Vite frontend client for the Pagi Pagi Padel admin panel.

## Commands

```sh
pnpm install
pnpm dev
pnpm build
pnpm worker:dev
pnpm worker:deploy
```

The dev server proxies `/api/*` to the configured panel API origin, so the browser can call the existing backend through same-origin local requests.

## API Proxy

The Worker proxy forwards `/api/*` requests to the existing API and returns browser-friendly CORS headers.

For local Worker testing, create `.dev.vars` from `.dev.vars.example` and set:

```sh
UPSTREAM_ORIGIN=<api-origin>
```

To deploy the Worker:

```sh
pnpm worker:secret
pnpm worker:deploy
```

## GitHub Pages

This app can be deployed as a static Vite bundle. The GitHub Actions workflow builds with:

```sh
VITE_BASE_PATH=/pagi-pagi-padel-panel/
VITE_API_BASE_URL=<worker-proxy-origin>
```

Set `PANEL_PROXY_ORIGIN` in GitHub repository secrets to the deployed Worker origin.
