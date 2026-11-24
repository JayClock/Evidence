import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { serializeDomainModel } from '@evidence-poc/evidence-model-core';
import {
  initializeWorkspace,
  modelDigestOf,
  openWorkspace,
  readModelDirectory,
  writeModelDirectory,
  workspacePaths,
} from '@evidence-poc/evidence-model-io';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import type {
  CreateProjectDocumentInput,
  CreateProjectInput,
  CreateProjectResult,
  EvidenceProjectSummary,
  OpenProjectResult,
  SaveProjectResult,
} from '@evidence-poc/desktop-contracts/projects';
import {
  createStarterDocument,
  deriveModelId,
} from './templates/starterModels';

export const RECENT_PROJECTS_FILE = 'workspace-recents.json';

const MAX_RECENT_PROJECTS = 20;

export interface ProjectStoreOptions {
  /** Absolute path of the JSON file remembering recent projects. */
  recentProjectsFile: string;
  now?: () => Date;
}

export interface ProjectStore {
  listRecent(): Promise<readonly EvidenceProjectSummary[]>;
  open(rootPath: string): Promise<OpenProjectResult>;
  /** Writes a starter model to a new workspace. */
  create(input: CreateProjectInput): Promise<CreateProjectResult>;
  /**
   * Initializes a workspace with an already-built document.
   *
   * The ingestion path compiles a document before it knows where it goes, so the
   * store has to accept one; the caller keeps the manifest name and id.
   */
  createFromDocument(
    input: CreateProjectDocumentInput,
  ): Promise<CreateProjectResult>;
  save(
    rootPath: string,
    document: DomainModelDocument,
    sourceDigest?: string,
  ): Promise<SaveProjectResult>;
  /** Latest mtime of the model source tree, used to detect external writes. */
  fingerprint(rootPath: string): Promise<string | null>;
}

export const modelRootFor = (rootPath: string) =>
  workspacePaths(rootPath).model;

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '未知错误。';

const readRecent = async (file: string): Promise<EvidenceProjectSummary[]> => {
  try {
    const raw = await readFile(file, 'utf8');
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) ? (parsed as EvidenceProjectSummary[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    return [];
  }
};

const writeAtomically = async (
  absolute: string,
  content: string,
): Promise<void> => {
  await mkdir(path.dirname(absolute), { recursive: true });

  const temporary = `${absolute}.tmp-${randomUUID()}`;

  await writeFile(temporary, content, 'utf8');
  await rename(temporary, absolute);
};

const summarize = (
  rootPath: string,
  document: DomainModelDocument,
  lastOpenedAt: string,
): EvidenceProjectSummary => ({
  rootPath,
  modelDirectory: modelRootFor(rootPath),
  name: document.manifest.name,
  modelId: document.manifest.id,
  modelVersion: document.manifest.version,
  entityCount: document.entities.length,
  relationshipCount: document.relationships.length,
  ruleCount: document.rules.length,
  lastOpenedAt,
});

/**
 * File-backed project store for the desktop shell.
 *
 * The store never keeps a model in memory: `open` parses the current source
 * tree, `save` writes the document the renderer holds, so an external agent can
 * keep editing the same files without fighting a hidden cache.
 */
export const createProjectStore = ({
  recentProjectsFile,
  now = () => new Date(),
}: ProjectStoreOptions): ProjectStore => {
  const remember = async (project: EvidenceProjectSummary): Promise<void> => {
    const previous = await readRecent(recentProjectsFile);
    const next = [
      project,
      ...previous.filter((item) => item.rootPath !== project.rootPath),
    ].slice(0, MAX_RECENT_PROJECTS);

    await writeAtomically(
      recentProjectsFile,
      `${JSON.stringify(next, null, 2)}\n`,
    );
  };

  const writeProject = async (
    target: string,
    document: DomainModelDocument,
  ): Promise<CreateProjectResult> => {
    const { root } = await initializeWorkspace(target, document);
    const project = summarize(root, document, now().toISOString());
    await remember(project);

    return { success: true, project, document };
  };

  return {
    async listRecent() {
      return readRecent(recentProjectsFile);
    },

    async create(input) {
      try {
        const document = createStarterDocument(input.templateId ?? 'blank', {
          name: input.name,
          modelId: input.modelId ?? deriveModelId(input.name),
        });

        return await writeProject(input.targetPath, document);
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },

    async createFromDocument(input) {
      try {
        return await writeProject(input.targetPath, input.document);
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },

    async open(rootPath) {
      try {
        const { root, model } = openWorkspace(rootPath);
        const parsed = await readModelDirectory(model);

        if (parsed.issues.length > 0) {
          return {
            success: false,
            error: parsed.issues
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join('\n'),
          };
        }

        const project = summarize(root, parsed.document, now().toISOString());

        await remember(project);

        return {
          success: true,
          project,
          document: parsed.document,
          issues: parsed.issues,
          sourceDigest: modelDigestOf(parsed.files),
        };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },

    async save(rootPath, document, sourceDigest) {
      try {
        const { model } = openWorkspace(rootPath);
        const current = await readModelDirectory(model);
        if (
          current.issues.length > 0 ||
          (sourceDigest !== undefined &&
            sourceDigest !== modelDigestOf(current.files))
        )
          throw new Error(
            'WORKSPACE_CHANGED: 磁盘上的模型已变更，请先从磁盘重新加载。',
          );
        const result = await writeModelDirectory(model, document);

        return {
          success: true,
          written: result.written,
          unchanged: result.unchanged,
          removed: result.removed,
          savedAt: now().toISOString(),
          sourceDigest: modelDigestOf(serializeDomainModel(document)),
        };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },

    async fingerprint(rootPath) {
      const parsed = await Promise.resolve()
        .then(() => readModelDirectory(openWorkspace(rootPath).model))
        .catch(() => null);

      if (parsed === null || parsed.files.length === 0) {
        return null;
      }

      return modelDigestOf(parsed.files);
    },
  };
};
