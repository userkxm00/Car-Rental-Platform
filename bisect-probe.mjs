import js from '@eslint/js';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/postgres-data/**', '**/package-lock.json'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  { plugins: { security }, rules: {} },
  { files: ['apps/api/**/*.ts'], languageOptions: { globals: { ...globals.node, ...globals.jest }, parserOptions: { project: './apps/api/tsconfig.eslint.json' } } },
  { files: ['apps/agency-web/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser, ...globals.node }, parserOptions: { project: './apps/agency-web/tsconfig.eslint.json' } } },
  { files: ['packages/ui/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser }, parserOptions: { project: './packages/ui/tsconfig.eslint.json' } } },
  { files: ['packages/**/*.ts', '!packages/ui/**'], languageOptions: { globals: { ...globals.node, ...globals.jest }, parserOptions: { project: ['./packages/config/tsconfig.eslint.json', './packages/api-client/tsconfig.eslint.json'] } } },
  eslintConfigPrettier,
);
