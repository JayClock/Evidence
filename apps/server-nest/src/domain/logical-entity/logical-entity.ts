import { Entity, HasMany, Ref } from '../core';
import { DomainError } from '../error';

export interface EntityAttribute {
  id: string;
  name: string;
  label?: string | null;
  type?: string | null;
  description?: string | null;
}

export type LogicalEntityType = 'EVIDENCE' | 'PARTICIPANT' | 'ROLE' | 'CONTEXT';

const VALID_SUB_TYPES: Record<LogicalEntityType, string[]> = {
  EVIDENCE: [
    'rfp',
    'proposal',
    'contract',
    'fulfillment_request',
    'fulfillment_confirmation',
    'other_evidence',
  ],
  PARTICIPANT: ['party', 'thing'],
  ROLE: ['party', 'domain', '3rd system', 'context', 'evidence'],
  CONTEXT: ['bounded_context'],
};

export function parseLogicalEntityType(value: string): LogicalEntityType {
  switch (value.trim()) {
    case 'EVIDENCE':
    case 'Evidence':
    case 'evidence':
      return 'EVIDENCE';
    case 'PARTICIPANT':
    case 'Participant':
    case 'participant':
      return 'PARTICIPANT';
    case 'ROLE':
    case 'Role':
    case 'role':
      return 'ROLE';
    case 'CONTEXT':
    case 'Context':
    case 'context':
      return 'CONTEXT';
    default:
      throw DomainError.validation(`unknown logical entity type: ${value}`);
  }
}

export function normalizeSubType(
  entityType: LogicalEntityType,
  value?: string | null,
): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let raw = trimmed;
  if (trimmed.includes(':')) {
    const [prefix, ...rest] = trimmed.split(':');
    if (prefix.trim() !== entityType) {
      throw DomainError.validation(
        `subType prefix ${prefix} does not match logical entity type ${entityType}`,
      );
    }
    raw = rest.join(':').trim();
  }

  const valid = VALID_SUB_TYPES[entityType].find(
    (candidate) => candidate.toLocaleLowerCase() === raw.toLocaleLowerCase(),
  );
  if (!valid) {
    throw DomainError.validation(`unknown ${entityType} subType: ${raw}`);
  }
  return valid;
}

export function formatSubType(
  entityType: LogicalEntityType,
  subType?: string | null,
): string | null {
  return subType ? `${entityType}:${subType}` : null;
}

export interface LogicalEntityDescription {
  workspace: Ref<string>;
  type: LogicalEntityType;
  subType: string | null;
  name: string;
  label: string | null;
  description: string | null;
  attributes: EntityAttribute[];
  createdAt: string;
  updatedAt: string;
}

export class LogicalEntity implements Entity<string, LogicalEntityDescription> {
  constructor(
    private readonly id: string,
    private readonly desc: LogicalEntityDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  workspaceId(): string {
    return this.desc.workspace.id();
  }

  description(): LogicalEntityDescription {
    return this.desc;
  }

  createdAt(): string {
    return this.desc.createdAt;
  }

  updatedAt(): string {
    return this.desc.updatedAt;
  }
}

export interface WorkspaceLogicalEntities extends HasMany<LogicalEntity> {
  add(desc: LogicalEntityDescription): Promise<LogicalEntity>;
  update(
    entityId: string,
    desc: LogicalEntityDescription,
  ): Promise<LogicalEntity>;
  delete(entityId: string): Promise<void>;
  list(page: number, pageSize: number): Promise<[LogicalEntity[], number]>;
}
