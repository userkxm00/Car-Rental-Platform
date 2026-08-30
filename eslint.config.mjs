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
    files: ['packages/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        project: './packages/config/tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  eslintConfigPrettier,
);
