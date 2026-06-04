import { Entity, HasMany, Ref } from '../core';

export interface LogicalRelationshipDescription {
  workspace: Ref<string>;
  source: Ref<string>;
  target: Ref<string>;
  label: string | null;
}

export class LogicalRelationship
  implements Entity<string, LogicalRelationshipDescription>
{
  constructor(
    private readonly id: string,
    private readonly desc: LogicalRelationshipDescription,
  ) {}

  identity(): string {
    return this.id;
  }

  workspaceId(): string {
    return this.desc.workspace.id();
  }

  description(): LogicalRelationshipDescription {
    return this.desc;
  }
}

export interface WorkspaceLogicalRelationships
  extends HasMany<LogicalRelationship> {
  add(desc: LogicalRelationshipDescription): Promise<LogicalRelationship>;
  update(
    relationshipId: string,
    desc: LogicalRelationshipDescription,
  ): Promise<LogicalRelationship>;
  delete(relationshipId: string): Promise<void>;
  list(
    page: number,
    pageSize: number,
  ): Promise<[LogicalRelationship[], number]>;
}
