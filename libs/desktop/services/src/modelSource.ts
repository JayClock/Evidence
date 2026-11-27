import { workspacePaths } from '@evidence-poc/evidence-model-io';

/** The renderer always identifies a project by the selected directory. */
export const modelSourceOf = (rootPath: string): string =>
  workspacePaths(rootPath).model;
