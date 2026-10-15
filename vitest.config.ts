import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: {
      // The dependency's ESM entry contains lazy CommonJS transport imports.
      '@opentelemetry/otlp-exporter-base/node-http': nodeRequire.resolve('@opentelemetry/otlp-exporter-base/node-http'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/index.ts'],
    },
  },
});
