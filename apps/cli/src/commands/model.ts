import path from 'node:path';
import {
  buildFmCheckReport,
  compiledDocument,
  derivedTraceability,
} from '@evidence-poc/evidence-model-core';
import {
  compactCanonicalJson,
  prettyCanonicalJson,
} from '@evidence-poc/evidence-schema';
import { writeWorkspaceFile } from '@evidence-poc/evidence-model-io';
import type { CommandOptions, CommandContext } from '../context.js';
import { getWorkspace, loadModel } from '../model.js';

export async function modelCommand(
  command: 'compile' | 'inspect' | 'lineage',
  options: CommandOptions,
  context: CommandContext,
): Promise<number> {
  const workspace = getWorkspace(context, options);
  const model = await loadModel(workspace.model);
  if (command === 'inspect') {
    const summary = {
      path: workspace.root,
      modelId: model.manifest.id,
      modelName: model.manifest.name,
      modelVersion: model.manifest.version,
      entities: model.entities.length,
      relationships: model.relationships.length,
      rules: model.rules.length,
    };
    context.stdout(
      options.json
        ? JSON.stringify(summary, null, 2)
        : `${summary.modelName} (${summary.modelId}) — ${summary.entities} entities, ${summary.relationships} relationships, ${summary.rules} rules`,
    );
    return 0;
  }
  const { report } = buildFmCheckReport({ model });
  if (!report.valid) throw new Error(report.errors.join('\n'));
  const file = path.join(
    workspace.derived,
    command === 'compile' ? 'model.json' : 'lineage.json',
  );
  const document =
    command === 'compile'
      ? compiledDocument(model)
      : derivedTraceability(model);
  const json =
    options.compact === true
      ? compactCanonicalJson(document)
      : prettyCanonicalJson(document);
  await writeWorkspaceFile(workspace.root, file, json.trimEnd() + '\n');
  context.stdout(file);
  return 0;
}
