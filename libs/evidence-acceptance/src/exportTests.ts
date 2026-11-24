import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { readModelRoot } from '@evidence-poc/evidence-model-io';
import {
  buildDeliveryContract,
  validateDeliveryExamples,
} from '@evidence-poc/evidence-api';
import { buildDeliveryRoutes } from '@evidence-poc/evidence-api';
import { projectAcceptanceTests } from './delivery/scenarioProjector.js';
import { assertOpenApiContract } from '@evidence-poc/evidence-api';
import { renderAcceptanceSuite } from './renderer/brunoSuite.js';
import { writeOutput } from '@evidence-poc/evidence-api';

/** Direct source loader: inline examples are the only acceptance source. */
export async function exportAcceptanceTests(options: {
  modelDirectory: string;
  out: string;
}): Promise<{ files: string[]; flowCount: number; stepCount: number }> {
  const parsed = await readModelRoot(options.modelDirectory);
  if (parsed.issues.length > 0)
    throw new Error(
      `FM_INVALID: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')}`,
    );
  const model = parsed.document;
  const routes = buildDeliveryRoutes(model);
  const contract = buildDeliveryContract(model, routes);
  await assertOpenApiContract(contract);
  const invalid = validateDeliveryExamples(contract, routes);
  if (invalid.length > 0)
    throw new Error(
      `API_EXAMPLE_INVALID: ${invalid.map((issue) => issue.message).join('\n')}`,
    );
  const projection = projectAcceptanceTests(model, routes);
  const files = renderAcceptanceSuite(projection);
  // All validation and rendering precedes the atomic directory replacement.
  mkdirSync(path.dirname(options.out), { recursive: true });
  writeOutput(options.out, files);
  return {
    files: Object.keys(files).sort(),
    flowCount: projection.flows.length,
    stepCount: projection.flows.reduce(
      (total, flow) => total + flow.steps.length,
      0,
    ),
  };
}
