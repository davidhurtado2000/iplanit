// ESLint, deliberately minimal: ONE rule, React's rules-of-hooks. A hook called
// after an early return crashes a page the moment its data finishes loading
// (React error #310, which broke the calendar on 2026-11-20), and nothing else
// would catch it before production. No style rules on purpose: the goal is to
// find real bugs, not to produce warnings.
import reactHooks from 'eslint-plugin-react-hooks'
import tsParser from '@typescript-eslint/parser'
import nextPlugin from '@next/eslint-plugin-next'

export default [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'scripts/**', 'next-env.d.ts'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    // The Next plugin is only registered (rules off) because some files carry
    // old `eslint-disable @next/next/...` comments that name its rules.
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { 'react-hooks/rules-of-hooks': 'error', '@next/next/no-img-element': 'off' },
  },
]
