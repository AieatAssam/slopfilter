import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = new URL('./', import.meta.url).pathname;
const ortWasmFiles = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
] as const;

const copyOrtWasm = {
  name: 'copy-ort-wasm-runtime',
  closeBundle() {
    const output = resolve(root, 'dist');
    mkdirSync(output, { recursive: true });
    for (const file of ortWasmFiles) {
      copyFileSync(resolve(root, 'node_modules/onnxruntime-web/dist', file), resolve(output, file));
    }
  },
};

const copyC2paAssets = {
  name: 'copy-c2pa-assets',
  closeBundle() {
    const output = resolve(root, 'dist/offscreen');
    mkdirSync(output, { recursive: true });
    copyFileSync(
      resolve(root, 'node_modules/@contentauth/c2pa-web/dist/c2pa_worker.js'),
      resolve(output, 'c2pa_worker.js'),
    );
    copyFileSync(
      resolve(root, 'node_modules/@contentauth/c2pa-web/dist/resources/c2pa_bg.wasm'),
      resolve(output, 'c2pa_bg.wasm'),
    );
  },
};

export default defineConfig({
  define: {
    __SLOPFILTER_TEST_BUILD__: JSON.stringify(process.env.SLOPFILTER_BUILD_TARGET === 'test'),
  },
  resolve: { alias: { '@': `${root}src` } },
  publicDir: 'public',
  plugins: [copyOrtWasm, copyC2paAssets],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: false,
    rollupOptions: {
      input: {
        'background/service-worker': `${root}src/background/service-worker.ts`,
        'offscreen/offscreen': `${root}src/offscreen/offscreen.ts`,
        'offscreen/inference.worker': `${root}src/offscreen/inference.worker.ts`,
        'ui/popup/popup': `${root}src/ui/popup/popup.ts`,
        'ui/options/options': `${root}src/ui/options/options.ts`,
        'ui/onboarding/onboarding': `${root}src/ui/onboarding/onboarding.ts`,
        'ui/privacy/privacy': `${root}src/ui/privacy/privacy.ts`,
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
