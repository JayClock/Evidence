import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, context } from 'esbuild';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const outdir = resolve(workspaceRoot, 'apps/desktop/dist');
const watch = process.argv.includes('--watch');
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  outdir,
  external: ['electron', '@earendil-works/pi-coding-agent'],
  sourcemap: true,
  logLevel: 'info',
};
const configurations = [
  {
    ...shared,
    format: 'cjs',
    entryPoints: {
      main: resolve(workspaceRoot, 'apps/desktop/src/main.ts'),
      preload: resolve(workspaceRoot, 'apps/desktop/src/preload.ts'),
    },
  },
  {
    ...shared,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    entryPoints: {
      'agent-runtime': resolve(
        workspaceRoot,
        'apps/desktop/src/features/diagram/agent-runtime.ts',
      ),
      'inbox-analyst-runtime': resolve(
        workspaceRoot,
        'apps/desktop/src/inbox-analyst-runtime.ts',
      ),
      'kickoff-analyst-runtime': resolve(
        workspaceRoot,
        'apps/desktop/src/kickoff-analyst-runtime.ts',
      ),
      'understanding-analyst-runtime': resolve(
        workspaceRoot,
        'apps/desktop/src/understanding-analyst-runtime.ts',
      ),
      'tasking-analyst-runtime': resolve(
        workspaceRoot,
        'apps/desktop/src/tasking-analyst-runtime.ts',
      ),
      'pair-driver-runtime': resolve(
        workspaceRoot,
        'apps/desktop/src/loops/pair/driver-runtime.ts',
      ),
      'pair-red-reviewer-runtime': resolve(
        workspaceRoot,
        'apps/desktop/src/loops/pair/red-reviewer-runtime.ts',
      ),
      'showcase-reviewer-runtime': resolve(
        workspaceRoot,
        'apps/desktop/src/showcase-reviewer-runtime.ts',
      ),
      'respond-learner-runtime': resolve(
        workspaceRoot,
        'apps/desktop/src/respond-learner-runtime.ts',
      ),
    },
  },
];

await Promise.all(
  [
    'main.js',
    'main.js.map',
    'preload.js',
    'preload.js.map',
    'agent-runtime.js',
    'agent-runtime.js.map',
    'agent-runtime.mjs',
    'agent-runtime.mjs.map',
    'inbox-analyst-runtime.mjs',
    'inbox-analyst-runtime.mjs.map',
    'kickoff-analyst-runtime.mjs',
    'kickoff-analyst-runtime.mjs.map',
    'understanding-analyst-runtime.mjs',
    'understanding-analyst-runtime.mjs.map',
    'tasking-analyst-runtime.mjs',
    'tasking-analyst-runtime.mjs.map',
    'pair-driver-runtime.mjs',
    'pair-driver-runtime.mjs.map',
    'pair-red-reviewer-runtime.mjs',
    'pair-red-reviewer-runtime.mjs.map',
    'showcase-reviewer-runtime.mjs',
    'showcase-reviewer-runtime.mjs.map',
    'respond-learner-runtime.mjs',
    'respond-learner-runtime.mjs.map',
  ].map((file) => rm(resolve(outdir, file), { force: true })),
);
if (!watch) {
  await Promise.all(
    configurations.map((configuration) => build(configuration)),
  );
} else {
  const contexts = await Promise.all(
    configurations.map((configuration) => context(configuration)),
  );
  await Promise.all(contexts.map((buildContext) => buildContext.watch()));
  process.stdout.write(
    'Desktop main, preload, and Agent runtimes are watching.\n',
  );

  const dispose = async () => {
    await Promise.all(contexts.map((buildContext) => buildContext.dispose()));
    process.exit(0);
  };
  process.once('SIGINT', () => void dispose());
  process.once('SIGTERM', () => void dispose());
}
