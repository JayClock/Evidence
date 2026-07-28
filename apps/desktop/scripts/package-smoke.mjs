import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const desktopRoot = resolve(import.meta.dirname, '..');
const packagesRoot = join(desktopRoot, 'dist', 'packages');
const packaged = packagedRuntime(packagesRoot);
const piSdkEntry = join(
  packaged.resources,
  'app.asar.unpacked',
  'node_modules',
  '@earendil-works',
  'pi-coding-agent',
  'dist',
  'index.js',
);
const taskingAnalystEntry = join(
  packaged.resources,
  'app.asar.unpacked',
  'dist',
  'tasking-analyst-runtime.mjs',
);
const pairDriverEntry = join(
  packaged.resources,
  'app.asar.unpacked',
  'dist',
  'pair-driver-runtime.mjs',
);
const pairRedReviewerEntry = join(
  packaged.resources,
  'app.asar.unpacked',
  'dist',
  'pair-red-reviewer-runtime.mjs',
);
const showcaseReviewerEntry = join(
  packaged.resources,
  'app.asar.unpacked',
  'dist',
  'showcase-reviewer-runtime.mjs',
);
const testRoot = await mkdtemp(join(tmpdir(), 'evidence-package-smoke-'));
const fakeApi = await startFakeApi();
let output = '';

try {
  await Promise.all([
    access(packaged.executable),
    access(piSdkEntry),
    access(taskingAnalystEntry),
    access(pairDriverEntry),
    access(pairRedReviewerEntry),
    access(showcaseReviewerEntry),
  ]);
  const sdkCheck = `import('@earendil-works/pi-coding-agent').then((sdk) => {
    if (typeof sdk.createAgentSession !== 'function') throw new Error('createAgentSession is unavailable');
    process.stdout.write('PI_SDK_READY\\n');
  })`;
  const piResult = await run(
    packaged.executable,
    ['-e', sdkCheck],
    { ELECTRON_RUN_AS_NODE: '1' },
    10_000,
    join(packaged.resources, 'app.asar.unpacked', 'dist'),
  );
  output += piResult.output;
  if (piResult.exitCode !== 0 || !piResult.output.includes('PI_SDK_READY')) {
    throw new Error('Embedded Pi SDK did not load successfully.');
  }

  const launch = electronLaunch(packaged.executable);
  const result = await run(
    launch.command,
    launch.args,
    {
      EVIDENCE_API_BASE_URL: fakeApi.baseUrl,
      EVIDENCE_DESKTOP_SMOKE_TEST: '1',
      EVIDENCE_USER_DATA_PATH: testRoot,
    },
    30_000,
  );
  output += result.output;
  if (result.exitCode !== 0) {
    throw new Error(`Packaged app exited with code ${result.exitCode}.`);
  }
  if (!result.output.includes('EVIDENCE_DESKTOP_SMOKE_READY')) {
    throw new Error('Packaged app did not report readiness.');
  }
  process.stdout.write('Packaged Electron smoke test passed.\n');
} catch (error) {
  process.stderr.write(output);
  process.stderr.write(`Fake API requests: ${fakeApi.requests.join(', ')}\n`);
  throw error;
} finally {
  await fakeApi.close();
  await rm(testRoot, { recursive: true, force: true });
}

function startFakeApi() {
  return new Promise((resolveStart, reject) => {
    const requests = [];
    const server = createServer((request, response) => {
      requests.push(`${request.method ?? 'GET'} ${request.url ?? '/'}`);
      response.setHeader('access-control-allow-origin', '*');
      response.setHeader('content-type', 'application/hal+json');
      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
      }

      const body = responseBody(request.url ?? '/');
      if (!body) {
        response.statusCode = 404;
        response.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      response.end(JSON.stringify(body));
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not reserve a fake API port.'));
        return;
      }
      resolveStart({
        baseUrl: `http://127.0.0.1:${address.port}/api`,
        requests,
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((error) =>
              error ? rejectClose(error) : resolveClose(),
            );
          }),
      });
    });
  });
}

function responseBody(pathname) {
  if (pathname === '/health') {
    return { service: 'evidence-server', status: 'ok' };
  }
  if (pathname === '/api') {
    return {
      _links: {
        self: { href: '/api' },
        health: { href: '/health' },
        'current-user': { href: '/api/users/desktop-user' },
      },
    };
  }
  if (pathname === '/api/users/desktop-user') {
    return {
      _links: {
        self: { href: '/api/users/desktop-user' },
        sidebar: { href: '/api/users/desktop-user/sidebar' },
        memberships: { href: '/api/users/desktop-user/memberships' },
        'create-workspace': { href: '/api/workspaces' },
      },
      id: 'desktop-user',
      name: 'Desktop User',
      email: 'desktop@evidence.local',
    };
  }
  if (pathname === '/api/users/desktop-user/sidebar') {
    return {
      _links: {
        self: { href: '/api/users/desktop-user/sidebar' },
        user: { href: '/api/users/desktop-user' },
      },
      sections: [],
    };
  }
  if (pathname === '/api/users/desktop-user/memberships') {
    return {
      _links: { self: { href: pathname } },
      _embedded: { memberships: [] },
      page: { number: 1, size: 20, totalElements: 0, totalPages: 0 },
    };
  }
  return null;
}

function packagedRuntime(root) {
  if (process.platform === 'darwin') {
    const app = join(root, `mac-${process.arch}`, 'Evidence.app', 'Contents');
    return {
      executable: join(app, 'MacOS', 'Evidence'),
      resources: join(app, 'Resources'),
    };
  }
  if (process.platform === 'win32') {
    const application = join(root, 'win-unpacked');
    return {
      executable: join(application, 'Evidence.exe'),
      resources: join(application, 'resources'),
    };
  }
  const application = join(root, 'linux-unpacked');
  return {
    executable: join(application, 'evidence'),
    resources: join(application, 'resources'),
  };
}

function electronLaunch(executable) {
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    return { command: 'xvfb-run', args: ['-a', executable] };
  }
  return { command: executable, args: [] };
}

function run(command, args, environment, timeoutMs, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let combinedOutput = '';
    const append = (chunk) => {
      combinedOutput += chunk.toString();
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(
          `Packaged runtime smoke test timed out. Output:\n${combinedOutput}`,
        ),
      );
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (exitCode) => {
      clearTimeout(timeout);
      resolvePromise({ exitCode, output: combinedOutput });
    });
  });
}
