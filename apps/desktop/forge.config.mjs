import { extractFile, statFile } from '@electron/asar';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

const productName = 'Evidence Modeling';

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
const config = {
  packagerConfig: {
    name: productName,
    appBundleId: 'dev.evidence.modeling',
    asar: true,
    // Ship the main/renderer bundles and the JSON seeds read relative to the app root.
    ignore: (file) =>
      Boolean(file) && !/^\/(?:\.vite|starter-models)(?:\/|$)/.test(file),
    ...(process.env.APPLE_ID
      ? {
          osxSign: {},
          osxNotarize: {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
          },
        }
      : {}),
  },
  hooks: {
    async postPackage(_config, { platform, outputPaths }) {
      const assets = path.join(import.meta.dirname, 'starter-models');
      const templates = await readdir(assets);
      for (const output of outputPaths) {
        const resources =
          platform === 'darwin' || platform === 'mas'
            ? path.join(output, productName + '.app', 'Contents', 'Resources')
            : path.join(output, 'resources');
        const archive = path.join(resources, 'app.asar');
        for (const entry of [
          '.vite/build/main.js',
          '.vite/build/preload.js',
          '.vite/renderer/main_window/index.html',
        ]) {
          if (!statFile(archive, entry).size)
            throw new Error('Missing packaged entry ' + entry);
        }
        for (const template of templates) {
          const expected = await readFile(path.join(assets, template));
          if (
            !extractFile(archive, 'starter-models/' + template).equals(expected)
          )
            throw new Error(
              'Packaged starter model differs from source: ' + template,
            );
        }
      }
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mjs',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.mjs',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mjs',
        },
      ],
    }),
  ],
};

export default config;
