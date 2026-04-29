import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Program > FunctionDeclaration[id.name=/^[A-Z][a-zA-Z0-9]*$/]',
          message:
            'В одном файле — один React-компонент верхнего уровня.',
        },
        {
          selector:
            'BlockStatement > FunctionDeclaration[id.name=/^[A-Z][a-zA-Z0-9]*$/]',
          message:
            'Вложенные React-компоненты запрещены. Вынесите в отдельный файл.',
        },
        {
          selector:
            'Program > VariableDeclaration > VariableDeclarator[id.name=/^[A-Z][a-zA-Z0-9]*$/][init.type=/^(ArrowFunctionExpression|FunctionExpression|CallExpression)$/]',
          message:
            'В одном файле — один React-компонент верхнего уровня.',
        },
        {
          selector:
            'BlockStatement > VariableDeclaration > VariableDeclarator[id.name=/^[A-Z][a-zA-Z0-9]*$/][init.type=/^(ArrowFunctionExpression|FunctionExpression|CallExpression)$/]',
          message:
            'Вложенные React-компоненты запрещены. Вынесите в отдельный файл.',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['src/app/App/index.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
])
