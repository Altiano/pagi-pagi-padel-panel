import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const panelApiOrigin = process.env.PANEL_API_ORIGIN || 'http://127.0.0.1:8787';
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
    'import.meta.env.VITE_BUILD_DATE': JSON.stringify(new Date().toISOString().slice(0, 10)),
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
