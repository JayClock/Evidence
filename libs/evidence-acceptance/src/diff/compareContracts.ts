import { assertOpenApiContract } from '@evidence-poc/evidence-api';
import type { EvidenceApiSnapshot } from '@evidence-poc/evidence-api';
import { hasErrors } from '@evidence-poc/evidence-api';
import { OasdiffRunner, type OasdiffComparison } from './oasdiffRunner.js';

export interface ContractComparison extends OasdiffComparison {
  baseModelDigest: string;
  targetModelDigest: string;
}

/** Compare published artefacts at the same capability scope, without re-projecting them. */
export const compareOpenApiContracts = async (
  base: Record<string, unknown>,
  target: Record<string, unknown>,
  runner = new OasdiffRunner(),
): Promise<OasdiffComparison> => {
  if (base['x-evidence-model'] !== target['x-evidence-model'])
    throw new Error('API_MODEL_MISMATCH: 不能比较不同模型');
  if (base['x-evidence-service'] !== target['x-evidence-service'])
    throw new Error(
      'API_SERVICE_MISMATCH: 不能比较不同服务或混用聚合与分服务契约',
    );
  await assertOpenApiContract(base);
  await assertOpenApiContract(target);
  return runner.compare(base, target);
};

/** Compares the final contracts, including validated route overlays. */
export const compareContracts = async (
  base: EvidenceApiSnapshot,
  target: EvidenceApiSnapshot,
  runner = new OasdiffRunner(),
): Promise<ContractComparison> => {
  if (base.modelId !== target.modelId)
    throw new Error('API_MODEL_MISMATCH: 不能比较不同模型');
  const diagnostics = [...base.diagnostics, ...target.diagnostics];
  if (hasErrors(diagnostics))
    throw new Error(
      diagnostics.map((item) => `${item.code}: ${item.message}`).join('\n'),
    );
  return {
    ...(await compareOpenApiContracts(
      { ...base.openapi },
      { ...target.openapi },
      runner,
    )),
    baseModelDigest: base.digests.model,
    targetModelDigest: target.digests.model,
  };
};
