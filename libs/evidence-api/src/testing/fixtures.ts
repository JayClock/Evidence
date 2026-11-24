import { fileURLToPath } from 'node:url';

import { buildFmCheckReport } from '@evidence-poc/evidence-model-core';
import {
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
} from '@evidence-poc/evidence-model-io';

import { loadModel, type ModelIndex } from '../../src/adapter/modelAdapter.js';

/** Model fixtures shared by snapshot, adapter and contract tests. */

export const API_FIXTURES = fileURLToPath(
  new URL('../../tests/fixtures/', import.meta.url),
);

export const fullLifecycle = (): { modelRoot: string } => ({
  modelRoot: `${API_FIXTURES}full-lifecycle/fm`,
});

/** The report `check_fm` would have produced for a delivered scope. */
export const checkReportFor = async (
  modelRoot: string,
  scopes: readonly string[],
): Promise<Record<string, unknown>> => {
  const { document, issues } = await readModelRoot(modelRoot);
  const bytes = await readModelRootBytes(modelRoot);
  const { report } = buildFmCheckReport({
    model: document,
    sourceIssues: issues.map((issue) => `${issue.path}: ${issue.message}`),
    modelDigest: modelDigestOf(
      bytes.map((file) => ({ path: file.path, content: file.bytes })),
    ),
    scopeRefs: scopes,
  });

  return report as unknown as Record<string, unknown>;
};

let cachedIndex: ModelIndex | undefined;

/** The checked model the full-lifecycle design was written against. */
export const fullLifecycleIndex = async (): Promise<ModelIndex> => {
  if (cachedIndex === undefined) {
    const { modelRoot } = fullLifecycle();
    const check = await checkReportFor(modelRoot, [
      'context.product-procurement',
    ]);
    const { index, diagnostics } = await loadModel(modelRoot, check);

    if (index === null) {
      throw new Error(`fixture did not load: ${JSON.stringify(diagnostics)}`);
    }

    cachedIndex = index;
  }

  return cachedIndex;
};
