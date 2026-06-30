import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '.claude/**',
      'dist/**',
      'http-captures/**',
      'node_modules/**',
      'worker/**',
    ],
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      import: importPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      'import/extensions': ['.js', '.jsx'],
      'import/ignore': ['\\.(css|png|jpe?g|svg)$'],
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx'],
        },
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'import/no-unresolved': ['error', { commonjs: true, caseSensitive: true }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['vite.config.js', 'eslint.config.js'],
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.test.{js,jsx}'],
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
];
