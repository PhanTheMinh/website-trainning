const js = require('@eslint/js')
const globals = require('globals')

module.exports = [
    {
        ignores: ['coverage/**', 'frontend/**', 'node_modules/**']
    },
    js.configs.recommended,
    {
        files: [
            'src/**/*.js',
            'migrations/**/*.js',
            'scripts/**/*.js',
            'tests/**/*.js'
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: globals.node
        },
        rules: {
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                caughtErrors: 'none'
            }]
        }
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: globals.jest
        }
    }
]
