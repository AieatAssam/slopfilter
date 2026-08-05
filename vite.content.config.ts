import { defineConfig } from 'vite';

const root = new URL('./', import.meta.url).pathname;

export default defineConfig({
  resolve: { alias: { '@': `${root}src` } },
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome120',
    sourcemap: false,
    rollupOptions: {
      input: { 'content/index': `${root}src/content/index.ts` },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
        inlineDynamicImports: true,
      },
    },
  },
});
