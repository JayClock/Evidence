import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const extensionRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    // Pi provides this package to extensions at runtime; tests use a small
    // structural mock so the product workspace need not depend on Pi itself.
    alias: {
      '@earendil-works/pi-coding-agent': `${extensionRoot}test-support/pi-coding-agent.mock.ts`,
      '@earendil-works/pi-tui': `${extensionRoot}test-support/pi-tui.mock.ts`,
    },
  },
  test: {
    environment: 'node',
    include: ['.pi/extensions/evidence-orchestrator/**/*.spec.ts'],
    // Most suites create Git repositories and worktrees. Running files in
    // parallel makes their 5-second fail-fast budgets contend on local I/O.
    maxWorkers: 1,
  },
});
