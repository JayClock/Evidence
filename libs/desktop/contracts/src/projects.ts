import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

/** A directory that owns a canonical .evidence workspace. */
export interface EvidenceProjectSummary {
  rootPath: string;
  modelDirectory: string;
  name: string;
  modelId: string;
  modelVersion: string;
  entityCount: number;
  relationshipCount: number;
  ruleCount: number;
  lastOpenedAt: string;
}

/** Parse or FM check finding surfaced next to the dashboard entry. */
export interface ProjectSourceIssue {
  path: string;
  message: string;
  code?: string;
}

export type OpenProjectResult =
  | {
      success: true;
      project: EvidenceProjectSummary;
      document: DomainModelDocument;
      issues: readonly ProjectSourceIssue[];
      sourceDigest?: string;
      persistenceId?: string;
    }
  | { success: false; error: string };

export interface LivePersistenceInput {
  persistenceId: string;
  revision: number;
  document: DomainModelDocument;
}

export type PersistenceResult =
  | { success: true }
  | { success: false; error: string };

export type PersistenceState =
  | { kind: 'queued' | 'writing' | 'persisted' }
  | { kind: 'conflict' | 'failed'; error: string };

export type PersistenceStatus = PersistenceState & {
  persistenceId: string;
  revision: number;
};

export type SaveProjectResult =
  | {
      success: true;
      written: readonly string[];
      unchanged: readonly string[];
      removed: readonly string[];
      savedAt: string;
      sourceDigest?: string;
    }
  | { success: false; error: string; conflict?: true };

export type RecentProjectsResult =
  | { success: true; projects: readonly EvidenceProjectSummary[] }
  | { success: false; error: string };

export type OpenProjectDialogResult =
  | { success: true; rootPath: string }
  | { success: false; canceled: true }
  | { success: false; canceled?: false; error: string };

/** Emitted when `.evidence/model` changes outside the app (git, scripts, agent). */
export interface ProjectChangedEvent {
  rootPath: string;
  changedAt: string;
  paths: readonly string[];
}

export interface SaveProjectInput {
  rootPath: string;
  sourceDigest?: string;
  document: DomainModelDocument;
}

/** One route the delivery contract declares. */
export interface DeliveryPreviewRoute {
  method: string;
  path: string;
  summary: string;
  serviceId: string;
}

/** One service the model splits into, as the delivery hub lists it. */
export interface DeliveryPreviewService {
  id: string;
  name: string;
  kind: 'channel' | 'fulfillment' | 'domain' | 'capability';
  contextRef: string;
  supplies: readonly string[];
  consumes: readonly string[];
  notes: string;
  routePrefixes: readonly string[];
  routes: readonly string[];
  routeCount: number;
}

export interface DeliveryPreviewLink {
  id: string;
  from: string;
  to: string;
  kind: string;
  mode: string;
  label: string;
  viaRef: string;
}

/** What the delivery hub shows before anything is written. */
export interface DeliveryPreview {
  modelId: string;
  modelName: string;
  modelVersion: string;
  services: readonly DeliveryPreviewService[];
  links: readonly DeliveryPreviewLink[];
  routes: readonly DeliveryPreviewRoute[];
  /** What the model cannot answer yet, shown instead of hidden. */
  limitations: readonly string[];
}

/**
 * Starter models a new project can be seeded with.
 *
 * Every id but `blank` ships a complete, statically valid `.evidence/model` tree so
 * a first-time reader sees Contracts, Fulfillment pairs and Evidence instead of
 * an empty canvas.
 */
export type ProjectTemplateId =
  | 'blank'
  | 'procurement'
  | 'subscription'
  | 'service_blueprint';

/** What the dashboard shows on a template card. */
export interface ProjectTemplateMeta {
  id: ProjectTemplateId;
  name: string;
  description: string;
  /** Short provenance line, e.g. the lecture case the starter replays. */
  source: string;
  entityCount: number;
  relationshipCount: number;
  ruleCount: number;
}

export interface CreateProjectInput {
  /** Absolute path of the selected workspace directory. */
  targetPath: string;
  name: string;
  modelId?: string;
  templateId?: ProjectTemplateId;
}

export interface CreateProjectDocumentInput {
  targetPath: string;
  /** The compiled model; its manifest supplies the name and id. */
  document: DomainModelDocument;
}

export type CreateProjectResult =
  | {
      success: true;
      project: EvidenceProjectSummary;
      document: DomainModelDocument;
    }
  | { success: false; error: string };

export type CreateProjectDialogResult =
  | { success: true; targetPath: string }
  | { success: false; canceled: true }
  | { success: false; canceled?: false; error: string };

export type ProjectTemplatesResult =
  | { success: true; templates: readonly ProjectTemplateMeta[] }
  | { success: false; error: string };
