import { defineConfig } from 'vite';

const root = new URL('./', import.meta.url).pathname;

export default defineConfig({
  root: `${root}tests/harness`,
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [root] },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  resolve: { alias: { '@': `${root}src` } },
});
