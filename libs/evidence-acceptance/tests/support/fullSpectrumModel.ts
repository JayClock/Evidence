import { fileURLToPath } from 'node:url';
import { readModelDirectory } from '@evidence-poc/evidence-model-io';

const { document, issues } = await readModelDirectory(
  fileURLToPath(
    new URL(
      '../../../../examples/full-spectrum-procurement/.evidence/model',
      import.meta.url,
    ),
  ),
);
if (issues.length) throw new Error(JSON.stringify(issues));

export const fullSpectrumModel = () => structuredClone(document);
