import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
export default defineConfig(({ mode, isPreview }) => {
  // The shared build must not expose Miniflare's local administration API.
  if (isPreview) process.env.X_LOCAL_EXPLORER = 'false';
  return {
    cacheDir: `node_modules/.vite/${mode}`,
    plugins: [
      react(),
      tailwindcss(),
      cloudflare({ inspectorPort: isPreview || mode.startsWith('test-') ? false : undefined }),
    ],
    server: { port: 5173 },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
      allowedHosts: ['roomtune.dzoanh.me'],
    },
  };
});
