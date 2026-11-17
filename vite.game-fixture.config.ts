import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Game browser tests intercept every API request with their own fixture.
// Keep them independent of workerd, hosted credentials, and the public preview.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir: 'node_modules/.vite/game-browser-fixture',
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
});
