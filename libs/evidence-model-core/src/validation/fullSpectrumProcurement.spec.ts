import { fileURLToPath } from 'node:url';
import { buildFmCheckReport } from './fmCheck.js';
import { readModelRoot } from '../../tests/support/modelRoot.js';
import { compileCelExpression } from '../cel/celEvaluator.js';

it('keeps the full-spectrum example schema-valid, traceable and CEL-compilable', async () => {
  const parsed = await readModelRoot(
    fileURLToPath(
      new URL(
        '../../../../examples/full-spectrum-procurement/.evidence/model',
        import.meta.url,
      ),
    ),
  );
  expect(parsed.issues).toEqual([]);
  const { report } = buildFmCheckReport({ model: parsed.document });
  expect(report.errors).toEqual([]);
  expect(report.valid).toBe(true);
  for (const rule of parsed.document.rules)
    expect(() => compileCelExpression(rule.expression)).not.toThrow();
});
