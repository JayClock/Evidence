import { defineTool, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

const nullableString = Type.Union([Type.String(), Type.Null()]);
const nullableNumber = Type.Union([Type.Number(), Type.Null()]);
const nullableObject = Type.Union([
  Type.Record(Type.String(), Type.Any()),
  Type.Null(),
]);

const ref = Type.Object({
  id: Type.String({ description: 'Referenced node id' }),
});

const position = Type.Object({
  x: Type.Number(),
  y: Type.Number(),
});

const draftNode = Type.Object({
  id: Type.String(),
  kind: nullableString,
  parent: Type.Union([ref, Type.Null()]),
  position,
  width: Type.Union([Type.Integer(), Type.Null()]),
  height: Type.Union([Type.Integer(), Type.Null()]),
  data: Type.Object(
    {
      name: Type.String(),
      label: nullableString,
      type: Type.Union([
        Type.Literal('EVIDENCE'),
        Type.Literal('PARTICIPANT'),
        Type.Literal('ROLE'),
        Type.Literal('CONTEXT'),
      ]),
      subType: nullableString,
    },
    { additionalProperties: true },
  ),
});

const draftEdge = Type.Object({
  id: nullableString,
  source: ref,
  target: ref,
  sourceHandle: nullableString,
  targetHandle: nullableString,
  kind: nullableString,
  relationType: nullableString,
  label: nullableString,
  style: Type.Record(Type.String(), Type.Any()),
  data: Type.Record(Type.String(), Type.Any()),
  animated: Type.Boolean(),
  hidden: Type.Boolean(),
  markerStart: nullableObject,
  markerEnd: nullableObject,
  pathOptions: Type.Record(Type.String(), Type.Any()),
  interactionWidth: nullableNumber,
});

const proposalParameters = Type.Object({
  summary: Type.String({ description: 'Short human-readable summary' }),
  changes: Type.Object({
    addNodes: Type.Array(draftNode),
    updateNodes: Type.Array(draftNode),
    deleteNodes: Type.Array(Type.String()),
    addEdges: Type.Array(draftEdge),
    updateEdges: Type.Array(draftEdge),
    deleteEdges: Type.Array(Type.String()),
  }),
});

const submitModelingProposalTool = defineTool({
  name: 'submit_modeling_proposal',
  label: 'Submit Modeling Proposal',
  description:
    'Submit the final Evidence FM diagram modeling proposal. Use this exactly once as the final action.',
  promptSnippet: 'Submit the final Evidence FM diagram modeling proposal',
  promptGuidelines: [
    'Use submit_modeling_proposal exactly once as the final action for Evidence FM diagram modeling requests.',
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
