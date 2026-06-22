import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const panelApiOrigin = process.env.PANEL_API_ORIGIN || 'http://127.0.0.1:8787';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
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
