import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = dirname(fileURLToPath(import.meta.url));
const LIVE_WORKER_ORIGIN = 'https://pagi-pagi-padel-api-proxy.altianogerung.workers.dev';
const LOCAL_WORKER_ORIGIN = 'http://127.0.0.1:8787';

// Without a local .dev.vars the local Wrangler worker can't reach the upstream
// (no UPSTREAM_ORIGIN), so default the dev proxy to the deployed worker instead.
const hasLocalWorkerConfig = existsSync(resolve(rootDir, '.dev.vars'));
const panelApiOrigin = process.env.PANEL_API_ORIGIN
  || (hasLocalWorkerConfig ? LOCAL_WORKER_ORIGIN : LIVE_WORKER_ORIGIN);

console.log(`[vite] proxying /api → ${panelApiOrigin}`);

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
    'import.meta.env.VITE_BUILD_TIMESTAMP': JSON.stringify(new Date().toISOString()),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: panelApiOrigin,
        changeOrigin: true,
        secure: true,
        headers: {
          Origin: panelApiOrigin,
          Referer: `${panelApiOrigin}/`,
        },
      },
    },
  },
});
