import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Only for making the samples: npx vitest run -c scripts/samples/vitest.config.ts
export default defineConfig({
  test: { root: resolve(__dirname, '../..'), include: ['scripts/samples/make-samples.ts'] }
});
