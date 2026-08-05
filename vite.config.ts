import { defineConfig } from 'vite';

const root = new URL('./', import.meta.url).pathname;

export default defineConfig({
  resolve: { alias: { '@': `${root}src` } },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: false,
    rollupOptions: {
      input: {
        'background/service-worker': `${root}src/background/service-worker.ts`,
        'ui/popup/popup': `${root}src/ui/popup/popup.ts`,
        'ui/options/options': `${root}src/ui/options/options.ts`,
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
