import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Browser suites intercept their API requests or explicitly disable the backend.
// Keep them independent of workerd, hosted credentials, and the public preview.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  cacheDir: `node_modules/.vite/browser-fixture-${mode}`,
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    watch: {
      ignored: [
        '**/.roomtune/**',
        '**/.wrangler/**',
        '**/backups/**',
        '**/dist/**',
        '**/test-results/**',
      ],
    },
  },
}));
