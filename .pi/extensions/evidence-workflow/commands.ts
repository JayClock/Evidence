import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { copyFileSync, existsSync } from 'node:fs';
import { ensureProjectDirs, missingPaths } from './artifacts';
import { answerClarification } from './clarifications';
import { phaseModelConfig } from './config';
import { answerGate, isGateAnswered, resolvePendingGate } from './gates';
import { artifactPath, artifactRelativePath, iterationRoot } from './iteration';
import { PHASE_META, PHASE_ORDER } from './phases';
import { buildPhasePrompt } from './prompts';
import {
  newIterationState,
  readState,
  selectWorkItem,
  writeState,
} from './state';
import { statusMarkdown } from './status';
import type { Phase } from './types';

function parseArgs(args: string): {
  phase?: string;
  dryRun: boolean;
  reset: boolean;
  storyId?: string;
  scenarioId?: string;
  rest: string;
} {
  const parts = args.split(/\s+/).filter(Boolean);
  const parsed = { dryRun: false, reset: false, rest: '' } as {
    phase?: string;
    dryRun: boolean;
    reset: boolean;
    storyId?: string;
    scenarioId?: string;
    rest: string;
  };
  const rest: string[] = [];
  for (const part of parts) {
    if (part === '--dry-run') parsed.dryRun = true;
    else if (part === '--reset') parsed.reset = true;
    else if (part.startsWith('--phase='))
      parsed.phase = part.slice('--phase='.length);
    else if (part.startsWith('--story='))
      parsed.storyId = part.slice('--story='.length);
    else if (part.startsWith('--scenario='))
      parsed.scenarioId = part.slice('--scenario='.length);
    else if (PHASE_ORDER.includes(part as Phase)) parsed.phase = part;
    else rest.push(part);
  }
  parsed.rest = rest.join(' ');
  return parsed;
}

export function registerCommands(pi: ExtensionAPI): void {
  pi.registerCommand('evidence-status', {
    description:
      'Show Evidence Workflow phase, gate, artifacts, and code status',
    handler: async (_args, ctx) =>
      ctx.ui.notify(statusMarkdown(ctx.cwd), 'info'),
  });

  pi.registerCommand('evidence-reset', {
    description:
      'Reset Evidence Workflow state to the frame phase for a new iteration',
    handler: async (_args, ctx) => {
      const previous = readState(ctx.cwd);
      const previousSeed = artifactPath(
        ctx.cwd,
        previous,
        'artifacts/00-user-input/requirements.md',
      );
      const legacySeed = `${ctx.cwd}/artifacts/00-user-input/requirements.md`;
      const state = newIterationState(ctx.cwd);
      ensureProjectDirs(ctx.cwd, iterationRoot(ctx.cwd, state));
      const nextSeed = artifactPath(
        ctx.cwd,
        state,
        'artifacts/00-user-input/requirements.md',
      );
      if (existsSync(previousSeed)) copyFileSync(previousSeed, nextSeed);
      else if (existsSync(legacySeed)) copyFileSync(legacySeed, nextSeed);
      ctx.ui.setStatus('evidence-workflow', `evidence:${state.phase}`);
      ctx.ui.notify(
        `Evidence Workflow started ${state.iteration_id} at frame; the prior seed input was copied for editing.`,
        'info',
      );
    },
  });

  pi.registerCommand('evidence-gate', {
    description: 'Answer the pending gate: /evidence-gate [decision text]',
    handler: async (args, ctx) => {
      const state = readState(ctx.cwd);
      if (!state.pending_gate) return ctx.ui.notify('No pending gate.', 'info');
      try {
        answerGate(
          ctx.cwd,
          state.pending_gate,
          args.trim() || '通过，进入下一阶段',
        );
        ctx.ui.notify(`Gate answered: ${state.pending_gate}`, 'info');
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-answer', {
    description:
      'Answer the single pending TQA clarification: /evidence-answer <answer>',
    handler: async (args, ctx) => {
      try {
        const state = answerClarification(ctx.cwd, args);
        ctx.ui.notify(
          `Answered clarification. Recorded exchanges: ${state.clarification_history?.length ?? 0}.`,
          'info',
        );
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });

  pi.registerCommand('evidence-run', {
    description:
      'Run the current Evidence Workflow phase; coding accepts --story=US-xxx --scenario=SC-xxx',
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      if (parsed.reset) {
        const previous = readState(ctx.cwd);
        const seed = artifactPath(
          ctx.cwd,
          previous,
          'artifacts/00-user-input/requirements.md',
        );
        const state = newIterationState(ctx.cwd);
        ensureProjectDirs(ctx.cwd, iterationRoot(ctx.cwd, state));
        if (existsSync(seed)) {
          copyFileSync(
            seed,
            artifactPath(
              ctx.cwd,
              state,
              'artifacts/00-user-input/requirements.md',
            ),
          );
        }
      }
      let state = readState(ctx.cwd);
      ensureProjectDirs(ctx.cwd, iterationRoot(ctx.cwd, state));
      if (state.pending_gate && isGateAnswered(ctx.cwd, state.pending_gate)) {
        state = resolvePendingGate(ctx.cwd);
      }
      if (state.halted) {
        ctx.ui.notify(
          `Iteration ${state.iteration_id} is halted: ${state.halted.reason}`,
          'error',
        );
        return;
      }
      if (state.pending_clarification) {
        const pending = state.pending_clarification;
        ctx.ui.notify(
          `Clarification ${pending.question_id} for ${pending.story_id} is awaiting a domain-expert answer: ${pending.question}. Run /evidence-answer <answer> before continuing.`,
          'info',
        );
        return;
      }
      if (parsed.phase && parsed.phase !== state.phase) {
        ctx.ui.notify(
          `Cannot run ${parsed.phase}: current phase is ${state.phase}. Use /evidence-reset before a new iteration.`,
          'error',
        );
        return;
      }
      if (parsed.storyId || parsed.scenarioId) {
        if (state.phase !== 'coding') {
          ctx.ui.notify(
            'A --story/--scenario work item can only be selected during coding.',
            'error',
          );
          return;
        }
        if (!parsed.storyId || !parsed.scenarioId) {
          ctx.ui.notify(
            'Coding requires both --story=US-xxx and --scenario=SC-xxx.',
            'error',
          );
          return;
        }
        try {
          selectWorkItem(ctx.cwd, parsed.storyId, parsed.scenarioId);
        } catch (error) {
          ctx.ui.notify(
            error instanceof Error ? error.message : String(error),
            'error',
          );
          return;
        }
      }
      const current = readState(ctx.cwd);
      if (
        current.pending_gate &&
        !isGateAnswered(ctx.cwd, current.pending_gate)
      ) {
        ctx.ui.notify(
          `Gate ${current.pending_gate} is pending. Edit ${artifactRelativePath(current, `artifacts/gates/${current.pending_gate}.md`)} or run /evidence-gate <decision>.`,
          'info',
        );
        return;
      }
      if (current.phase !== 'complete') {
        const missingInputs = missingPaths(
          ctx.cwd,
          PHASE_META[current.phase].inputs.map((path) =>
            artifactRelativePath(current, path),
          ),
        );
        if (missingInputs.length > 0) {
          ctx.ui.notify(
            `Cannot run ${current.phase}: missing inputs: ${missingInputs.join(', ')}.`,
            'error',
          );
          return;
        }
      }
      let prompt: string;
      try {
        prompt = buildPhasePrompt(ctx.cwd, parsed.phase, parsed.rest);
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
        return;
      }
      if (parsed.dryRun) return ctx.ui.notify(prompt, 'info');

      const configuredModel = phaseModelConfig(ctx.cwd, current.phase);
      if (configuredModel) {
        const model = ctx.modelRegistry.find(
          configuredModel.provider,
          configuredModel.model,
        );
        if (!model) {
          ctx.ui.notify(
            `Configured model is unavailable: ${configuredModel.provider}/${configuredModel.model}. Check /model and .pi/evidence-workflow.json.`,
            'error',
          );
          return;
        }
        const selected = await pi.setModel(model);
        if (!selected) {
          ctx.ui.notify(
            `No credentials are available for ${configuredModel.provider}/${configuredModel.model}. Run /login or configure the provider API key.`,
            'error',
          );
          return;
        }
        pi.setThinkingLevel(configuredModel.thinking);
        ctx.ui.notify(
          `Using ${configuredModel.provider}/${configuredModel.model} with ${configuredModel.thinking} thinking for ${current.phase}.`,
          'info',
        );
      }

      const updated = writeState(ctx.cwd, {
        ...current,
        pi: {
          enabled: true,
          version: 4,
          ...(current.pi ?? {}),
          last_command: `/evidence-run ${args}`.trim(),
          last_run_at: new Date().toISOString(),
        },
      });
      ctx.ui.setStatus(
        'evidence-workflow',
        `evidence:${updated.phase}:running`,
      );
      pi.sendUserMessage(prompt);
    },
  });
}
