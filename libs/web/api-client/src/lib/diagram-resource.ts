import type { Collection, Entity } from '@hateoas-ts/resource';

import type { components } from './openapi-schema.js';

import type { WorkspaceResource } from './workspace-resource.js';

type DiagramResourceSchema = components['schemas']['DiagramResource'];
type DiagramCollectionResourceSchema =
  components['schemas']['DiagramCollectionResource'];
type DiagramNodeResourceSchema = components['schemas']['NodeResource'];
type DiagramNodeCollectionResourceSchema =
  components['schemas']['NodeCollectionResource'];
type DiagramEdgeResourceSchema = components['schemas']['EdgeResource'];
type DiagramEdgeCollectionResourceSchema =
  components['schemas']['EdgeCollectionResource'];
type DiagramVersionResourceSchema =
  components['schemas']['DiagramVersionResource'];
type DiagramVersionCollectionResourceSchema =
  components['schemas']['DiagramVersionCollectionResource'];

export type ResourceRef = components['schemas']['RefModel'];
export type DiagramViewport = components['schemas']['Viewport'];
export type DiagramType = components['schemas']['DiagramType'];
export type DiagramStatus = components['schemas']['DiagramStatus'];
type RequiredNullable<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: Exclude<T[P], undefined>;
};

export type DiagramResourceData = Omit<
  DiagramResourceSchema,
  '_links' | '_templates'
>;
export type DiagramCollectionResourceData = Omit<
  DiagramCollectionResourceSchema,
  '_links' | '_templates' | '_embedded'
>;
export type DiagramNodeResourceData = RequiredNullable<
  Omit<DiagramNodeResourceSchema, '_links'>,
  'parent' | 'width' | 'height'
>;
export type DiagramNodeCollectionResourceData = Omit<
  DiagramNodeCollectionResourceSchema,
  '_links' | '_embedded'
>;
export type DiagramEdgeResourceData = RequiredNullable<
  Omit<DiagramEdgeResourceSchema, '_links'>,
  'sourceHandle' | 'targetHandle' | 'kind' | 'interactionWidth'
>;
export type DiagramEdgeCollectionResourceData = Omit<
  DiagramEdgeCollectionResourceSchema,
  '_links' | '_embedded'
>;
export type DiagramVersionResourceData = Omit<
  DiagramVersionResourceSchema,
  '_links'
>;
export type DiagramVersionCollectionResourceData = Omit<
  DiagramVersionCollectionResourceSchema,
  '_links' | '_embedded'
>;

export type DiagramNodeResource = Entity<
  DiagramNodeResourceData,
  {
    self: DiagramNodeResource;
    collection: DiagramNodeCollectionResource;
    diagram: DiagramResource;
  }
>;

export type DiagramNodeCollectionResource = Entity<
  DiagramNodeCollectionResourceData,
  {
    self: DiagramNodeCollectionResource;
    diagram: DiagramResource;
  }
>;

export type DiagramEdgeResource = Entity<
  DiagramEdgeResourceData,
  {
    self: DiagramEdgeResource;
    collection: DiagramEdgeCollectionResource;
    diagram: DiagramResource;
  }
>;

export type DiagramEdgeCollectionResource = Entity<
  DiagramEdgeCollectionResourceData,
  {
    self: DiagramEdgeCollectionResource;
    diagram: DiagramResource;
  }
>;

export type DiagramVersionResource = Entity<
  DiagramVersionResourceData,
  {
    self: DiagramVersionResource;
    diagram: DiagramResource;
  }
>;

export type DiagramVersionCollectionResource = Entity<
  DiagramVersionCollectionResourceData,
  {
    self: DiagramVersionCollectionResource;
    diagram: DiagramResource;
  }
>;

export type DiagramResource = Entity<
  DiagramResourceData,
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
    DiagramCollectionResourceData,
    {
      self: DiagramCollectionResource;
      workspace: WorkspaceResource;
      prev: DiagramCollectionResource;
      next: DiagramCollectionResource;
      'create-diagram': DiagramResource;
    }
  >;
