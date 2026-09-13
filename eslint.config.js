import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // QuickBite uses effects for Supabase data loading, subscriptions and timers.
      // Keep purity/dependency checks active, but do not flag these intentional effect-driven loads.
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  {
    files: ['src/app/pages/student/StudentMenuPage.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      // Checkout identifiers are generated for a new order lifecycle and intentionally depend on UI state.
      'react-hooks/purity': 'off',
    },
  },

  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        crypto: 'readonly',
      },
    },
  },

  {
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['api/**/*.js'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
  },

  prettier,
);
