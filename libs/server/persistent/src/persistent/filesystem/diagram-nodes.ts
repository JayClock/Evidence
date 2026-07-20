import { join } from 'node:path';
import {
  DiagramNode,
  type JsonObject,
  type NodeDescription,
  Ref,
} from '@evidence/server-domain';
import { EntityList } from '../database';
import {
  fileTimestamp,
  listYamlFiles,
  optionalString,
  readYamlRecord,
  requiredString,
  type YamlRecord,
} from './model-files';

interface ProjectedNode {
  id: string;
  sortName: string;
  description: NodeDescription;
}

export class FileDiagramNodes extends EntityList<DiagramNode> {
  private readonly entitiesDirectory: string;

  constructor(
    private readonly diagramId: string,
    evidenceRoot: string,
  ) {
    super();
    this.entitiesDirectory = join(evidenceRoot, 'entities');
  }

  override async size(): Promise<number> {
    return (await this.load()).length;
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<DiagramNode[]> {
    return (await this.load())
      .slice(from, to)
      .map((record) => new DiagramNode(record.id, record.description));
  }

  protected override async findEntity(id: string): Promise<DiagramNode | null> {
    const record = (await this.load()).find((candidate) => candidate.id === id);
    return record ? new DiagramNode(record.id, record.description) : null;
  }

  private async load(): Promise<ProjectedNode[]> {
    const paths = await listYamlFiles(this.entitiesDirectory);
    const records = await Promise.all(paths.map((path) => this.readNode(path)));
    records.sort(
      (left, right) =>
        left.sortName.localeCompare(right.sortName) ||
        left.id.localeCompare(right.id),
    );

    return records.map((record, index) => ({
      ...record,
      description: {
        ...record.description,
        position: gridPosition(index),
      },
    }));
  }

  private async readNode(path: string): Promise<ProjectedNode> {
    const document = await readYamlRecord(path, 'entity');
    const id = requiredString(document, 'id', path, 'entity');
    const name = requiredString(document, 'name', path, 'entity');
    const entityType = requiredString(document, 'type', path, 'entity');
    const label = optionalString(document.label);
    const subType = optionalString(document.subType ?? document.sub_type);
    const parent = optionalString(document.parent);
    const content = optionalContent(document.content ?? document.description);
    const timestamp = await fileTimestamp(path);

    return {
      id,
      sortName: label ?? name,
      description: {
        diagram: new Ref(this.diagramId),
        kind: nodeKind(entityType),
        logicalEntity: new Ref(id),
        parent: parent ? new Ref(parent) : null,
        position: { x: 0, y: 0 },
        width: null,
        height: null,
        data: nodeData(document, {
          id,
          name,
          entityType,
          label,
          subType,
          parent,
          content,
        }),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };
  }
}

function nodeData(
  document: YamlRecord,
  values: {
    id: string;
    name: string;
    entityType: string;
    label: string | null;
    subType: string | null;
    parent: string | null;
    content: string | null;
  },
): JsonObject {
  const data: JsonObject = {
    id: values.id,
    name: values.name,
    type: values.entityType,
  };
  if (values.label) data.label = values.label;
  if (values.subType) data.subType = values.subType;
  if (values.parent) data.parent = values.parent;
  if (values.content) data.content = values.content;
  if (Array.isArray(document.attributes) && document.attributes.length > 0) {
    data.attributes = document.attributes;
  }
  return data;
}

function optionalContent(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function nodeKind(entityType: string): string {
  return entityType.toUpperCase() === 'CONTEXT'
    ? 'group-container'
    : 'fulfillment-node';
}

function gridPosition(index: number): { x: number; y: number } {
  const columns = 4;
  return {
    x: 120 + (index % columns) * 240,
    y: 120 + Math.floor(index / columns) * 140,
  };
}
