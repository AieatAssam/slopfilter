import { defineConfig } from 'vite';

const root = new URL('./', import.meta.url).pathname;
const define = {
  __SLOPFILTER_TEST_BUILD__: JSON.stringify(process.env.SLOPFILTER_BUILD_TARGET === 'test'),
};

export default defineConfig({
  define,
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
