import {
  defineTool,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  RemoteEvidenceClient,
  type LogicalEntityInput,
  type LogicalRelationshipInput,
} from './api-client';

const logicalEntityType = Type.Union([
  Type.Literal('EVIDENCE'),
  Type.Literal('PARTICIPANT'),
  Type.Literal('ROLE'),
  Type.Literal('CONTEXT'),
]);

const nullableString = Type.Union([Type.String(), Type.Null()]);
const optionalNullableString = Type.Optional(nullableString);
const attribute = Type.Object({
  id: Type.String({ description: 'Stable attribute identifier' }),
  name: Type.String({ description: 'Attribute name' }),
  label: optionalNullableString,
  type: optionalNullableString,
  description: optionalNullableString,
});

export function createModelingAgentTools(
  client: RemoteEvidenceClient,
): ToolDefinition[] {
  return [
    defineTool({
      name: 'evidence_list_logical_entities',
      label: 'List logical entities',
      description:
        'Read every visible logical entity in the active remote Evidence workspace.',
      parameters: Type.Object({}),
      async execute(_toolCallId, _params, signal) {
        return toolResult(await client.listLogicalEntities(signal));
      },
    }),
    defineTool({
      name: 'evidence_create_logical_entity',
      label: 'Create logical entity',
      description:
        'Create one logical entity in the active remote Evidence workspace.',
      parameters: Type.Object({
        type: logicalEntityType,
        subType: optionalNullableString,
        name: Type.String(),
        label: optionalNullableString,
        description: optionalNullableString,
        attributes: Type.Optional(Type.Array(attribute)),
      }),
      async execute(_toolCallId, params, signal) {
        return toolResult(
          await client.createLogicalEntity(
            params as LogicalEntityInput,
            signal,
          ),
        );
      },
    }),
    defineTool({
      name: 'evidence_update_logical_entity',
      label: 'Update logical entity',
      description:
        'Update one existing logical entity in the active remote Evidence workspace.',
      parameters: Type.Object({
        entityId: Type.String(),
        type: Type.Optional(logicalEntityType),
        subType: optionalNullableString,
        name: Type.Optional(Type.String()),
        label: optionalNullableString,
        description: optionalNullableString,
        attributes: Type.Optional(Type.Array(attribute)),
      }),
      async execute(_toolCallId, params, signal) {
        const { entityId, ...input } = params;
        return toolResult(
          await client.updateLogicalEntity(entityId, input, signal),
        );
      },
    }),
    defineTool({
      name: 'evidence_delete_logical_entity',
      label: 'Delete logical entity',
      description:
        'Delete one logical entity only when the user explicitly requested that deletion in the current message.',
      parameters: Type.Object({ entityId: Type.String() }),
      async execute(_toolCallId, params, signal) {
        return toolResult(
          await client.deleteLogicalEntity(params.entityId, signal),
        );
      },
    }),
    defineTool({
      name: 'evidence_list_logical_relationships',
      label: 'List logical relationships',
      description:
        'Read every visible logical relationship in the active remote Evidence workspace.',
      parameters: Type.Object({}),
      async execute(_toolCallId, _params, signal) {
        return toolResult(await client.listLogicalRelationships(signal));
      },
    }),
    defineTool({
      name: 'evidence_create_logical_relationship',
      label: 'Create logical relationship',
      description:
        'Create one relationship between two existing logical entities in the active remote workspace.',
      parameters: Type.Object({
        sourceId: Type.String(),
        targetId: Type.String(),
        label: optionalNullableString,
      }),
      async execute(_toolCallId, params, signal) {
        const input: LogicalRelationshipInput = {
          source: { id: params.sourceId },
          target: { id: params.targetId },
          label: params.label,
        };
        return toolResult(
          await client.createLogicalRelationship(input, signal),
        );
      },
    }),
    defineTool({
      name: 'evidence_update_logical_relationship',
      label: 'Update logical relationship',
      description:
        'Update one existing logical relationship in the active remote Evidence workspace.',
      parameters: Type.Object({
        relationshipId: Type.String(),
        sourceId: Type.Optional(Type.String()),
        targetId: Type.Optional(Type.String()),
        label: optionalNullableString,
      }),
      async execute(_toolCallId, params, signal) {
        const input: Partial<LogicalRelationshipInput> = {
          ...(params.sourceId ? { source: { id: params.sourceId } } : {}),
          ...(params.targetId ? { target: { id: params.targetId } } : {}),
          ...(params.label === undefined ? {} : { label: params.label }),
        };
        return toolResult(
          await client.updateLogicalRelationship(
            params.relationshipId,
            input,
            signal,
          ),
        );
      },
    }),
    defineTool({
      name: 'evidence_delete_logical_relationship',
      label: 'Delete logical relationship',
      description:
        'Delete one logical relationship only when the user explicitly requested that deletion in the current message.',
      parameters: Type.Object({ relationshipId: Type.String() }),
      async execute(_toolCallId, params, signal) {
        return toolResult(
          await client.deleteLogicalRelationship(params.relationshipId, signal),
        );
      },
    }),
  ];
}

function toolResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    details: value,
  };
}
