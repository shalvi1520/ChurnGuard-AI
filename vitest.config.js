import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    // Vitest's 5s default is too tight for the *first* test in a file here.
    // That test pays the module-init cost of everything the page imports
    // (framer-motion, zod, react-hook-form, lucide) on top of jsdom setup,
    // which this project measures in tens of seconds. The symptom was a test
    // that passed alone and failed intermittently in a full run -- a timeout
    // masquerading as a flaky assertion. Raised rather than worked around in
    // individual tests, since whichever test happens to run first in a file
    // is the one that pays.
    testTimeout: 20000,
  },
  esbuild: {
    jsx: 'automatic',
  },
});
