// SF-221: bundles scripts/calibration-scorer.ts into a plain ESM file that
// scripts/calibration-report.mjs can import. The component modules of the pipeline use only
// type-only imports plus execution-free config, so the bundle is small and dependency-free.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = process.cwd();

export default defineConfig({
  resolve: { alias: { '@': resolve(root, 'src') } },
  build: {
    outDir: 'dist-calibration',
    emptyOutDir: true,
    lib: {
      entry: resolve(root, 'scripts/calibration-scorer.ts'),
      formats: ['es'],
      fileName: 'calibration-scorer',
    },
    rollupOptions: { external: [/^node:/] },
  },
});
