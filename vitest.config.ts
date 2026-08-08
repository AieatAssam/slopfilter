import { defineConfig } from 'vitest/config';

const alias = { '@': new URL('./src', import.meta.url).pathname };

export default defineConfig({
  define: { __SLOPFILTER_TEST_BUILD__: false },
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'core',
          include: ['tests/unit/core/**/*.test.ts'],
          environment: 'node',
          restoreMocks: true,
          clearMocks: true,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'dom',
          include: ['tests/unit/**/*.test.ts'],
          exclude: ['tests/unit/core/**'],
          environment: 'jsdom',
          restoreMocks: true,
          clearMocks: true,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
    },
  },
});
