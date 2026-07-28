import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  desktopSourceBoundaryViolations,
  validateDesktopSourceBoundaries,
} from './source-boundaries';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('Desktop source boundaries', () => {
  it('keeps current production source inside explicit ownership zones', () => {
    expect(
      desktopSourceBoundaryViolations(resolve(process.cwd(), 'src')),
    ).toEqual([]);
  });

  it('rejects flat source buckets and private cross-loop imports', async () => {
    const root = await sourceFixture({
      'main.ts': "import './loops/respond/controller';\n",
      'preload.ts': '',
      'orphan.ts': 'export const orphan = true;\n',
      'loops/respond/controller.ts':
        "import { privateReview } from '../showcase/reviewer-tools';\nexport { privateReview };\n",
      'loops/showcase/reviewer-tools.ts':
        'export const privateReview = true;\n',
    });

    expect(desktopSourceBoundaryViolations(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'orphan.ts',
          reason: expect.stringContaining('source root'),
        }),
        expect.objectContaining({
          source: 'loops/respond/controller.ts',
          target: 'loops/showcase/reviewer-tools.ts',
          reason: expect.stringContaining('private code'),
        }),
      ]),
    );
  });

  it('allows a loop to consume another loop explicit public contract', async () => {
    const root = await sourceFixture({
      'main.ts': '',
      'preload.ts': '',
      'loops/respond/controller.ts':
        "import type { AcceptedRun } from '../showcase/public';\nexport type ResponseInput = AcceptedRun;\n",
      'loops/showcase/public.ts':
        'export interface AcceptedRun { id: string }\n',
    });

    expect(() => validateDesktopSourceBoundaries(root)).not.toThrow();
  });

  it('rejects technical intake buckets from returning', async () => {
    const root = await sourceFixture({
      'main.ts': '',
      'preload.ts': '',
      'capabilities/intake-runtime/session.ts':
        'export const session = true;\n',
    });

    expect(() => validateDesktopSourceBoundaries(root)).toThrow(
      'Intake is a domain artifact',
    );
  });
});

async function sourceFixture(
  files: Record<string, string>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-desktop-boundaries-'));
  temporaryPaths.push(root);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const path = join(root, relativePath);
      await mkdir(resolve(path, '..'), { recursive: true });
      await writeFile(path, content, 'utf8');
    }),
  );
  return root;
}
