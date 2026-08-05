import { defineConfig } from 'vite';

const root = new URL('./', import.meta.url).pathname;

export default defineConfig({
  root: `${root}tests/harness`,
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [root] },
  },
  resolve: { alias: { '@': `${root}src` } },
});
