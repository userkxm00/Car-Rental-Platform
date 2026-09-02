import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Root ESLint (flat) configuration — 01-A08.
 *
 * - typescript-eslint type-aware rules for backend/shared TypeScript.
 * - eslint-plugin-security for common security anti-patterns, with rules
 *   disabled that produce false positives for this codebase's patterns.
 * - Prettier owns formatting; eslint-config-prettier disables conflicts.
 *
 * New workspaces add their own `files` block + tsconfig.eslint.json so
 * type-aware linting never runs without a project reference.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/postgres-data/**',
      '**/package-lock.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    plugins: { security },
    rules: {
      // False positives for our DI/access patterns.
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-child-process': 'off',
      'security/detect-non-literal-regexp': 'off',
      // Production-grade async hygiene.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Conventional: `_`-prefixed parameters are intentionally unused
      // (interface conformance).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        project: './apps/api/tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['apps/agency-web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: './apps/agency-web/tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['apps/customer-web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: './apps/customer-web/tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        project: './packages/ui/tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['packages/**/*.ts'],
    // `ignores` (not a `!` entry inside `files`) is the flat-config
    // exclusion mechanism: `!packages/ui/**` inside `files` acts as a
    // negated glob matching everything EXCEPT packages/ui/**, which made
    // this block match (and clobber parserOptions.project for) unrelated
    // files such as apps/agency-web sources.
    ignores: ['packages/ui/**'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        project: [
          './packages/config/tsconfig.eslint.json',
          './packages/api-client/tsconfig.eslint.json',
          './packages/maps/tsconfig.eslint.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  eslintConfigPrettier,
);
