import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'happy-dom',

    // Test file patterns
    include: ['tests/**/*.{test,spec}.{js,mjs,ts}'],
    exclude: ['node_modules', 'dist'],

    // Global setup
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.js'],
      exclude: [
        'node_modules',
        'tests',
        '**/*.config.js'
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50
      }
    },

    // Timeout
    testTimeout: 10000,

    // Reporter
    reporters: ['default', 'html'],
    outputFile: {
      html: './test-results/index.html'
    },

    // Setup files
    setupFiles: ['./tests/setup.js']
  }
});
