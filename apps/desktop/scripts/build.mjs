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
    entryPoints: [
      resolve(workspaceRoot, 'apps/desktop/src/main.ts'),
      resolve(workspaceRoot, 'apps/desktop/src/preload.ts'),
    ],
  },
  {
    ...shared,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    entryPoints: [
      resolve(workspaceRoot, 'apps/desktop/src/agent-runtime.ts'),
      resolve(workspaceRoot, 'apps/desktop/src/coding-agent-runtime.ts'),
      resolve(workspaceRoot, 'apps/desktop/src/inbox-analyst-runtime.ts'),
      resolve(workspaceRoot, 'apps/desktop/src/kickoff-analyst-runtime.ts'),
    ],
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
    'coding-agent-runtime.js',
    'coding-agent-runtime.js.map',
    'coding-agent-runtime.mjs',
    'coding-agent-runtime.mjs.map',
    'inbox-analyst-runtime.mjs',
    'inbox-analyst-runtime.mjs.map',
    'kickoff-analyst-runtime.mjs',
    'kickoff-analyst-runtime.mjs.map',
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
