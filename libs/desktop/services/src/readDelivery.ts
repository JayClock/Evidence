import {
  buildProjection,
  hasErrors,
  loadModel,
  type DeliveryBundle,
} from '@evidence-poc/evidence-api';

/** Reads a model root and projects its delivery. */
export const readDelivery = async (
  modelRoot: string,
): Promise<DeliveryBundle> => {
  const loaded = await loadModel(modelRoot);
  if (loaded.index === null) {
    throw new Error(loaded.diagnostics.map((item) => item.message).join('；'));
  }
  const built = buildProjection({ index: loaded.index });
  if (hasErrors(built.diagnostics)) {
    throw new Error(built.diagnostics.map((item) => item.message).join('；'));
  }
  return built.projection;
};
