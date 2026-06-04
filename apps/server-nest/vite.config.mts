import { transform } from '@swc/core';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'),
) as { dependencies?: Record<string, string> };

const external = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  ...Object.keys(packageJson.dependencies ?? {}),
];

function nestSwc(): Plugin {
  return {
    name: 'evidence-server-nest-swc',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.endsWith('.ts') || id.includes('node_modules')) {
        return null;
      }

      const result = await transform(code, {
        filename: id,
        sourceMaps: true,
        inlineSourcesContent: true,
        jsc: {
          target: 'es2021',
          parser: {
            syntax: 'typescript',
            decorators: true,
          },
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
          },
        },
        module: {
          type: 'es6',
        },
      });

      return {
        code: result.code,
        map: result.map ? JSON.parse(result.map) : null,
      };
    },
  };
}

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/server-nest',
  plugins: [nestSwc()],
  build: {
    ssr: './src/main.ts',
    outDir: './dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'node20',
    minify: false,
    reportCompressedSize: false,
    rollupOptions: {
      external,
      output: {
        format: 'cjs',
        entryFileNames: 'main.js',
      },
    },
  },
}));
