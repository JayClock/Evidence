import { defineTool, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

const nullableString = Type.Union([Type.String(), Type.Null()]);

const ref = Type.Object({
  id: Type.String({ description: 'Referenced logical entity id' }),
});

const entityType = Type.Union([
  Type.Literal('EVIDENCE'),
  Type.Literal('PARTICIPANT'),
  Type.Literal('ROLE'),
  Type.Literal('CONTEXT'),
]);

const entityAttribute = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    label: Type.Optional(nullableString),
    type: Type.Optional(nullableString),
    description: Type.Optional(nullableString),
  },
  { additionalProperties: false },
);

const draftEntity = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    label: nullableString,
    type: entityType,
    subType: nullableString,
    description: Type.Optional(nullableString),
    attributes: Type.Optional(Type.Array(entityAttribute)),
  },
  { additionalProperties: false },
);

const draftRelationship = Type.Object({
  id: nullableString,
  source: ref,
  target: ref,
  label: nullableString,
});

const proposalParameters = Type.Object({
  summary: Type.String({ description: 'Short human-readable summary' }),
  changes: Type.Object({
    addEntities: Type.Array(draftEntity),
    updateEntities: Type.Array(draftEntity),
    deleteEntities: Type.Array(Type.String()),
    addRelationships: Type.Array(draftRelationship),
    updateRelationships: Type.Array(draftRelationship),
    deleteRelationships: Type.Array(Type.String()),
  }),
});

const submitModelingProposalTool = defineTool({
  name: 'submit_modeling_proposal',
  label: 'Submit Modeling Proposal',
  description:
    'Submit the final Evidence FM logical entity/relationship modeling proposal. Use this exactly once as the final action.',
  promptSnippet: 'Submit the final Evidence FM logical modeling proposal',
  promptGuidelines: [
    'Use submit_modeling_proposal exactly once as the final action for Evidence FM modeling requests.',
    'After calling submit_modeling_proposal, do not emit additional assistant text.',
  ],
  parameters: proposalParameters,

  async execute(_toolCallId, params) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Submitted modeling proposal: ${params.summary}`,
        },
      ],
      details: {
        proposal: params,
      },
      terminate: true,
    };
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(submitModelingProposalTool);
}
