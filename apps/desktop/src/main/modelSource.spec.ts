import path from 'node:path';
import { expect, it } from 'vitest';
import { modelSourceOf } from './modelSource';

it('always resolves the model beneath the selected work directory', () => {
  const root = path.resolve('workspace');
  expect(modelSourceOf(root)).toBe(path.join(root, '.evidence', 'model'));
});
