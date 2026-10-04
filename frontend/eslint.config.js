import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Хуки й дрібні утиліти живуть поруч із провайдерами/компонентами, яким вони належать
      'react-refresh/only-export-components': ['error', {
        allowExportNames: ['useApp', 'useApi', 'usePolling', 'useNav', 'EMAIL_DOMAIN', 'cx'],
      }],
    },
  },
])
