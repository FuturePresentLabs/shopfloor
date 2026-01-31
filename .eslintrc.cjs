module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  extends: [
    'eslint:recommended'
  ],
  plugins: [
    'html'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  settings: {
    'html/html-extensions': ['.html']
  },
  rules: {
    // Possible Errors
    'no-console': 'off',
    'no-debugger': 'warn',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    // Best Practices
    'eqeqeq': ['warn', 'always'],
    'no-eval': 'error',
    'no-implied-eval': 'error',

    // Stylistic
    'indent': ['warn', 2, { SwitchCase: 1 }],
    'quotes': ['warn', 'single', { avoidEscape: true }],
    'semi': ['warn', 'always'],
    'comma-dangle': ['warn', 'never'],

    // ES6
    'prefer-const': 'warn',
    'no-var': 'warn'
  },
  globals: {
    THREE: 'readonly'
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '*.min.js'
  ]
};
