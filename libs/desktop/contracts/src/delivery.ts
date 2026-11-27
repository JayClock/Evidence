import type { ContractComparison } from '@evidence-poc/evidence-acceptance';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type {
  DeliveryContract,
  DeliveryField,
} from '@evidence-poc/evidence-api';
import type { ApiCoverageSummary, SensorIssue, SensorReport } from '@evidence-poc/evidence-agent-sensors/browser';
import type { DeliveryPreview } from './projects.js';

/** The baseline is the document at editor open; save does not silently accept changes. */
export interface LiveDeliveryInput {
  rootPath: string;
  revision: number;
  document: DomainModelDocument;
  baseDocument: DomainModelDocument;
  /** Serialize draft files only for the delivery workspace, not the canvas rail. */
  includeArtifacts?: boolean;
}

export interface LiveDeliveryArtifact {
  path: string;
  content: string;
}

export interface LiveRouteBinding {
  id: string;
  entityRef: string;
  method: string;
  path: string;
  roleRefs: readonly string[];
  exposure: 'internal' | 'external';
  fields: readonly DeliveryField[];
}

export interface LiveDeliveryPreview {
  revision: number;
  modelDigest: string;
  baseModelDigest: string | null;
  preview: DeliveryPreview;
  /** Full authoring preview. Automatic sync writes only validated contexts. */
  openapi: DeliveryContract;
  artifacts?: readonly LiveDeliveryArtifact[];
  diff: ContractComparison | null;
  changeLog: string;
  apiSummary: ApiCoverageSummary;
  issues: readonly SensorIssue[];
  bindings: readonly LiveRouteBinding[];
}

export type LiveDeliveryResult =
  | { success: true; analysis: LiveDeliveryPreview }
  | { success: false; revision: number; error: string };

type ProjectionProblem = { kind: 'blocked' | 'failed'; error: string };

export type ContextDeliveryStatus =
  | { kind: 'running' }
  | {
      kind: 'synced';
      directory: string;
      synced: number;
      blocked: number;
      contexts: readonly {
        contextId: string;
        status: 'synced' | 'blocked' | 'empty';
        issues: readonly string[];
      }[];
    }
  | ProjectionProblem;

export type AcceptanceSyncStatus =
  | { kind: 'running' | 'empty' }
  | { kind: 'synced'; flows: number }
  | ProjectionProblem;

export interface ArtifactStatus {
  persistenceId: string;
  revision: number;
  sourceDigest: string;
  delivery: ContextDeliveryStatus;
  acceptance: AcceptanceSyncStatus;
  sensors:
    | { kind: 'running' }
    | { kind: 'checked'; report: SensorReport }
    | { kind: 'failed'; error: string };
}
