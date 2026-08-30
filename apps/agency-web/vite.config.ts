import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app'],
    proxy: {
      // Dev previews proxy API calls to the local NestJS backend so the
      // browser never needs to know the API host (production uses
      // VITE_API_URL instead).
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  define: {
    // Vitest config inside vite config requires the test types; keep the
    // alias for jsdom-only behavior in the browser build.
  },
});
