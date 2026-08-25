import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**']
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser
    },
    rules: {
      'vue/multi-word-component-names': ['error', {
        ignores: ['App']
      }]
    }
  },
  {
    files: ['**/*.test.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node
    }
  }
]
