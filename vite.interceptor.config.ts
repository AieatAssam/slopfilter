import { defineConfig } from 'vite';

const root = new URL('./', import.meta.url).pathname;
const define = {
  __SLOPFILTER_TEST_BUILD__: JSON.stringify(process.env.SLOPFILTER_BUILD_TARGET === 'test'),
};

// SF-216: the MAIN-world observer must be its own bundle; it cannot share the isolated-world
// content script because each world loads a separate script file from the manifest.
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
      input: { 'content/interceptor': `${root}src/content/interceptor.ts` },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
        inlineDynamicImports: true,
      },
    },
  },
});
