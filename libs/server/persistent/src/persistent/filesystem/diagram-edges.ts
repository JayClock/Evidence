import { join } from 'node:path';
import {
  DiagramEdge,
  type EdgeDescription,
  type JsonObject,
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

interface ProjectedEdge {
  id: string;
  sortName: string;
  description: EdgeDescription;
}

export class FileDiagramEdges extends EntityList<DiagramEdge> {
  private readonly associationsDirectory: string;

  constructor(
    private readonly diagramId: string,
    evidenceRoot: string,
  ) {
    super();
    this.associationsDirectory = join(evidenceRoot, 'associations');
  }

  override async size(): Promise<number> {
    return (await this.load()).length;
  }

  protected override async findEntities(
    from: number,
    to: number,
  ): Promise<DiagramEdge[]> {
    return (await this.load())
      .slice(from, to)
      .map((record) => new DiagramEdge(record.id, record.description));
  }

  protected override async findEntity(id: string): Promise<DiagramEdge | null> {
    const record = (await this.load()).find((candidate) => candidate.id === id);
    return record ? new DiagramEdge(record.id, record.description) : null;
  }

  private async load(): Promise<ProjectedEdge[]> {
    const paths = await listYamlFiles(this.associationsDirectory);
    const records = await Promise.all(paths.map((path) => this.readEdge(path)));
    records.sort(
      (left, right) =>
        left.sortName.localeCompare(right.sortName) ||
        left.id.localeCompare(right.id),
    );
    return records;
  }

  private async readEdge(path: string): Promise<ProjectedEdge> {
    const document = await readYamlRecord(path, 'association');
    const id = requiredString(document, 'id', path, 'association');
    const name = requiredString(document, 'name', path, 'association');
    const source = requiredString(document, 'source', path, 'association');
    const target = requiredString(document, 'target', path, 'association');
    const label = optionalString(document.label);
    const timestamp = await fileTimestamp(path);

    return {
      id,
      sortName: label ?? name,
      description: {
        diagram: new Ref(this.diagramId),
        source: new Ref(source),
        target: new Ref(target),
        logicalRelationship: new Ref(id),
        sourceHandle: null,
        targetHandle: null,
        kind: 'animated',
        style: {},
        data: edgeData(document, { id, name, source, target, label }),
        animated: true,
        hidden: false,
        markerStart: null,
        markerEnd: null,
        pathOptions: {},
        interactionWidth: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };
  }
}

function edgeData(
  document: YamlRecord,
  values: {
    id: string;
    name: string;
    source: string;
    target: string;
    label: string | null;
  },
): JsonObject {
  const data: JsonObject = {
    id: values.id,
    name: values.name,
    source: values.source,
    target: values.target,
  };
  const kind = optionalString(document.kind);
  const relationshipType = optionalString(
    document.relationshipType ?? document.relationship_type,
  );
  const direction = optionalString(document.direction);
  const cardinality = optionalString(document.cardinality);
  const summary = optionalString(document.summary);

  if (kind) data.kind = kind;
  if (values.label) data.label = values.label;
  if (relationshipType) data.relationType = relationshipType;
  if (direction) data.direction = direction;
  if (cardinality) data.cardinality = cardinality;
  if (summary) data.summary = summary;
  return data;
}
