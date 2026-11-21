import path from 'node:path'
import { defineConfig } from 'vitest/config'

// SQL tests (tests-sql/): run the database scripts against a local Postgres
// (PGlite, in-process WebAssembly) before they ever touch Supabase. Kept out of
// the normal `pnpm test` on purpose; run them by hand before applying a script:
//   pnpm test:sql
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests-sql/**/*.test.ts'],
    // Starting an in-process Postgres and loading the scripts takes a moment.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
