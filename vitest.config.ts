import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // tests-sql/ runs the database scripts on a local Postgres; by hand, see vitest.sql.config.ts
    exclude: ['node_modules/**', '.next/**', 'tests-sql/**'],
  },
})
