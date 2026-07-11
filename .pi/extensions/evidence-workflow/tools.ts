import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { collectArtifacts, collectCodeFiles } from './artifacts';
import { answerGate, completePhase, isGateAnswered } from './gates';
import { PHASE_META } from './phases';
import { buildPhasePrompt } from './prompts';
import { readState } from './state';
import { statusMarkdown } from './status';
import type { Phase } from './types';

type JsonSchema = Record<string, unknown> & { __optional?: boolean };

const Type = {
  String(options: Record<string, unknown> = {}): JsonSchema {
    return { type: 'string', ...options };
  },
  Optional(schema: JsonSchema): JsonSchema {
    return { ...schema, __optional: true };
  },
  Object(properties: Record<string, JsonSchema>): JsonSchema {
    const cleaned: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];
    for (const [key, schema] of Object.entries(properties)) {
      const { __optional, ...rest } = schema;
      cleaned[key] = rest;
      if (!__optional) required.push(key);
    }
    return {
      type: 'object',
      properties: cleaned,
      required,
      additionalProperties: false,
    };
  },
};

const phaseParam = Type.Object({
  phase: Type.Optional(
    Type.String({
      description: 'Optional phase. Defaults to evidence-state.json phase.',
    }),
  ),
  instructions: Type.Optional(
    Type.String({
      description: 'Extra instructions to append to the phase prompt.',
    }),
  ),
});

export function registerTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'evidence_workflow_status',
    label: 'Evidence Workflow Status',
    description:
      'Read Evidence Workflow state, gates, artifacts, and code files',
    promptSnippet: 'Inspect the current Evidence Workflow pipeline status',
    promptGuidelines: [
      'Use evidence_workflow_status when the user asks what the Evidence Workflow pipeline is doing or what remains.',
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      return {
        content: [{ type: 'text', text: statusMarkdown(ctx.cwd) }],
        details: {
          state: readState(ctx.cwd),
          artifacts: collectArtifacts(ctx.cwd),
          codeFiles: collectCodeFiles(ctx.cwd),
        },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_workflow_phase_prompt',
    label: 'Evidence Workflow Phase Prompt',
    description:
      'Generate the native execution prompt for an Evidence Workflow phase',
    promptSnippet:
      'Build a phase-specific prompt for Evidence Workflow execution',
    promptGuidelines: [
      'Use evidence_workflow_phase_prompt before executing an Evidence Workflow phase.',
    ],
    parameters: phaseParam,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return {
        content: [
          {
            type: 'text',
            text: buildPhasePrompt(
              ctx.cwd,
              params.phase,
              params.instructions ?? '',
            ),
          },
        ],
        details: { state: readState(ctx.cwd) },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_workflow_complete_phase',
    label: 'Evidence Workflow Complete Phase',
    description:
      'Mark an Evidence Workflow phase complete, update state, and create a gate if configured',
    promptSnippet:
      'Complete an Evidence Workflow phase after all required artifacts and code are written',
    promptGuidelines: [
      'Use evidence_workflow_complete_phase after finishing all required outputs for an Evidence Workflow phase.',
    ],
    parameters: Type.Object({
      phase: Type.String({ description: 'Completed phase name' }),
      summary: Type.Optional(
        Type.String({ description: 'Brief completion summary' }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.phase === 'complete' || !(params.phase in PHASE_META)) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid phase for completion: ${params.phase}`,
            },
          ],
          isError: true,
        };
      }
      const state = completePhase(
        ctx.cwd,
        params.phase as Exclude<Phase, 'complete'>,
        params.summary ?? '',
      );
      return {
        content: [
          {
            type: 'text',
            text: `Completed ${params.phase}. Next phase=${state.phase}. Pending gate=${state.pending_gate ?? 'none'}.`,
          },
        ],
        details: { state },
      };
    },
  });

  pi.registerTool({
    name: 'evidence_workflow_gate',
    label: 'Evidence Workflow Gate',
    description: 'Write a decision into an Evidence Workflow gate file',
    promptSnippet: 'Answer a pending Evidence Workflow Markdown gate',
    promptGuidelines: [
      'Use evidence_workflow_gate only when the user explicitly approves, rejects, or answers an Evidence Workflow gate.',
    ],
    parameters: Type.Object({
      gateId: Type.String({
        description: 'Gate id, e.g. GATE-001-requirements',
      }),
      decision: Type.String({ description: 'Decision text to write' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const { gatePath } = answerGate(
          ctx.cwd,
          params.gateId,
          params.decision,
        );
        return {
          content: [
            {
              type: 'text',
              text: `Gate answered: ${params.gateId}. Answered=${isGateAnswered(ctx.cwd, params.gateId)}`,
            },
          ],
          details: { gatePath },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    },
  });
}
