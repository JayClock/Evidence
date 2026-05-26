import type { Collection, Entity } from '@hateoas-ts/resource';

import type { WorkspaceResource } from './workspace-resource.js';

type ResourceRef = {
  id: string;
};

export type DiagramViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type DiagramNodeResource = Entity<
  {
    id: string;
    kind: string;
    logicalEntity: ResourceRef | null;
    parent: ResourceRef | null;
    position: {
      x: number;
      y: number;
    };
    width: number | null;
    height: number | null;
    data: unknown;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: DiagramNodeResource;
    collection: DiagramNodeCollectionResource;
    diagram: DiagramResource;
  }
>;

export type DiagramNodeCollectionResource = Collection<DiagramNodeResource> &
  Entity<
    Record<string, never>,
    {
      self: DiagramNodeCollectionResource;
      diagram: DiagramResource;
    }
  >;

export type DiagramEdgeResource = Entity<
  {
    id: string;
    source: ResourceRef;
    target: ResourceRef;
    sourceHandle: string | null;
    targetHandle: string | null;
    kind: string | null;
    relationType: string | null;
    label: string | null;
    style: unknown;
    data: unknown;
    animated: boolean;
    hidden: boolean;
    markerStart: unknown;
    markerEnd: unknown;
    pathOptions: unknown;
    interactionWidth: number | null;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: DiagramEdgeResource;
    collection: DiagramEdgeCollectionResource;
    diagram: DiagramResource;
  }
>;

export type DiagramEdgeCollectionResource = Collection<DiagramEdgeResource> &
  Entity<
    Record<string, never>,
    {
      self: DiagramEdgeCollectionResource;
      diagram: DiagramResource;
    }
  >;

export type DiagramVersionCollectionResource = Collection<Entity> &
  Entity<
    Record<string, never>,
    {
      self: DiagramVersionCollectionResource;
      diagram: DiagramResource;
    }
  >;

export type DiagramResource = Entity<
  {
    id: string;
    title: string;
    type: string;
    status: string;
    viewport?: DiagramViewport;
    createdAt: string;
    updatedAt: string;
  },
  {
    self: DiagramResource;
    collection: DiagramCollectionResource;
    workspace: WorkspaceResource;
    nodes: DiagramNodeCollectionResource;
    edges: DiagramEdgeCollectionResource;
    versions: DiagramVersionCollectionResource;
    'commit-draft': DiagramResource;
    'propose-model': DiagramResource;
    publish: DiagramResource;
  }
>;

export type DiagramCollectionResource = Collection<DiagramResource> &
  Entity<
    {
      page: {
        number: number;
        size: number;
        totalElements: number;
        totalPages: number;
      };
    },
    {
      self: DiagramCollectionResource;
      workspace: WorkspaceResource;
      prev: DiagramCollectionResource;
      next: DiagramCollectionResource;
      'create-diagram': DiagramResource;
    }
  >;
