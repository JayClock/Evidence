import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  workspace,
  write,
} from '../../test-support/support';
import {
  activityToolDecision,
  createActivityToolPolicy,
  readActivityToolPolicy,
} from './activity-tool-policy';

const temporaryDirectories: string[] = [];

afterEach(() => {
  cleanupWorkspaces();
  temporaryDirectories
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true }));
});

describe('activity tool policy', () => {
  it('allows only test files inside the Test Driver roots', () => {
    const cwd = workspace();
    write(cwd, 'apps/web/src/example.test.ts', 'test');
    write(cwd, 'apps/web/src/example.ts', 'production');
    const policy = createActivityToolPolicy({
      cwd,
      role: 'test-driver',
      writeMode: 'test',
      writeRoots: ['apps/web/src'],
    });

    expect(
      activityToolDecision(policy, 'edit', {
        path: 'apps/web/src/example.test.ts',
      }),
    ).toEqual({ block: false });
    expect(
      activityToolDecision(policy, 'edit', {
        path: 'apps/web/src/example.ts',
      }),
    ).toMatchObject({ block: true });
    expect(
      activityToolDecision(policy, 'edit', {
        path: 'libs/web/outside.test.ts',
      }),
    ).toMatchObject({ block: true });
  });

  it('allows production paths but rejects tests and protected evidence', () => {
    const cwd = workspace();
    write(cwd, 'apps/web/src/example.ts', 'production');
    write(cwd, 'apps/web/src/example.test.ts', 'test');
    write(cwd, 'artifacts/iterations/ITER-0001/state.json', '{}');
    const policy = createActivityToolPolicy({
      cwd,
      role: 'production-driver',
      writeMode: 'production',
      writeRoots: ['apps/web'],
    });

    expect(
      activityToolDecision(policy, 'edit', {
        path: 'apps/web/src/example.ts',
      }),
    ).toEqual({ block: false });
    expect(
      activityToolDecision(policy, 'edit', {
        path: 'apps/web/src/example.test.ts',
      }),
    ).toMatchObject({ block: true });
    expect(
      activityToolDecision(policy, 'write', {
        path: 'artifacts/iterations/ITER-0001/state.json',
      }),
    ).toMatchObject({ block: true });
  });

  it('blocks absolute writes, traversal, symlink escape, and Bash', () => {
    const cwd = workspace();
    write(cwd, 'apps/web/src/example.ts', 'production');
    const outside = mkdtempSync(join(tmpdir(), 'evidence-policy-outside-'));
    temporaryDirectories.push(outside);
    writeFileSync(join(outside, 'escaped.ts'), 'outside');
    mkdirSync(join(cwd, 'apps', 'web', 'linked'), { recursive: true });
    rmSync(join(cwd, 'apps', 'web', 'linked'), { recursive: true });
    symlinkSync(outside, join(cwd, 'apps', 'web', 'linked'));
    const policy = createActivityToolPolicy({
      cwd,
      role: 'production-driver',
      writeMode: 'production',
      writeRoots: ['apps/web'],
    });

    expect(
      activityToolDecision(policy, 'write', {
        path: join(cwd, 'apps/web/src/new.ts'),
      }),
    ).toMatchObject({ block: true });
    expect(
      activityToolDecision(policy, 'write', { path: '../outside.ts' }),
    ).toMatchObject({ block: true });
    expect(
      activityToolDecision(policy, 'edit', {
        path: 'apps/web/linked/escaped.ts',
      }),
    ).toMatchObject({ block: true });
    expect(
      activityToolDecision(policy, 'bash', { command: 'git status' }),
    ).toEqual({
      block: true,
      reason: 'Activity agents cannot execute Bash.',
    });
  });

  it('keeps read-only roles inside non-secret declared roots', () => {
    const cwd = workspace();
    write(cwd, 'README.md', 'safe');
    write(cwd, '.env.local', 'TOKEN=secret');
    const bundle = mkdtempSync(join(tmpdir(), 'evidence-policy-bundle-'));
    temporaryDirectories.push(bundle);
    writeFileSync(join(bundle, 'diff.patch'), 'diff');
    const policy = createActivityToolPolicy({
      cwd,
      role: 'change-explainer',
      extraReadRoots: [bundle],
    });

    expect(activityToolDecision(policy, 'read', { path: 'README.md' })).toEqual(
      { block: false },
    );
    expect(
      activityToolDecision(policy, 'read', { path: '.env.local' }),
    ).toMatchObject({ block: true });
    expect(
      activityToolDecision(policy, 'read', {
        path: join(bundle, 'diff.patch'),
      }),
    ).toEqual({ block: false });
    expect(
      activityToolDecision(policy, 'write', { path: 'README.md' }),
    ).toMatchObject({ block: true });
  });

  it('rejects expired serialized policies', () => {
    const cwd = workspace();
    const policy = createActivityToolPolicy({
      cwd,
      role: 'red-reviewer',
      now: Date.parse('2026-01-01T00:00:00.000Z'),
    });
    const path = join(cwd, 'policy.json');
    writeFileSync(path, JSON.stringify(policy));

    expect(() =>
      readActivityToolPolicy(path, Date.parse('2026-01-01T00:16:00.000Z')),
    ).toThrow('Invalid or expired Evidence activity tool policy.');
  });
});
