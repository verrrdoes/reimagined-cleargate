import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests: pure helpers, and actions run against an in-memory fake of `@/lib/db` (no database). `server-only`
// resolves to its empty module here, as it does on the server, so modules such as lib/ids.ts can be imported.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname),
      'server-only': path.resolve(import.meta.dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
