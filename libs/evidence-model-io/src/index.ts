/**
 * Disk adapters for the FM model source tree.
 *
 * Everything in this package touches `node:fs`, so it is imported by the
 * process-side entry points only (the desktop main process, the sensors, the
 * CLI). The in-memory model itself lives in `@evidence-poc/evidence-model-core`
 * and stays usable from the renderer.
 */
export {
  readModelDirectory,
  writeModelDirectory,
  type WriteModelResult,
} from './adapters/diskAdapter.js';

export {
  MODEL_GENERATED_TREE,
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
  readModelRootFiles,
  type ModelRootBytes,
} from './adapters/modelRoot.js';

export {
  packModelDirectory,
  readModelBundle,
  unpackModelBundle,
  writeModelBundle,
  type UnpackResult,
  type WriteModelBundleResult,
} from './adapters/modelFileAdapter.js';

export {
  MODEL_DIRECTORY,
  workspacePaths,
  checkWorkspacePath,
  openWorkspace,
  findWorkspace,
  initializeWorkspace,
  writeWorkspaceFile,
} from './workspace.js';
