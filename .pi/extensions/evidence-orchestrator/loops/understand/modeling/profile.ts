import { writeState } from '../../../iteration/state-repository';
import type {
  ConfirmedModelingProfile,
  ModelingMethod,
  ModelingProfileProposal,
  ModelingSubject,
  WorkflowState,
} from '../../../iteration/state';
import { modelingText, requireModelingState } from './modeling-state';

const SUBJECTS = new Set<ModelingSubject>(['business', 'domain', 'tool']);
const METHODS = new Set<ModelingMethod>([
  'none',
  'object',
  'event',
  'four_color',
  'eight_x_flow',
  'algorithmic',
]);

export interface ModelingProfileInput {
  subject: ModelingSubject;
  method: ModelingMethod;
  modelChangeRequired: boolean | 'unknown';
  reason: string;
}

export interface ConfirmModelingProfileInput {
  reason?: string;
  subject?: ModelingSubject;
  method?: ModelingMethod;
  modelChangeRequired?: boolean;
}

function validateProfile(
  subject: ModelingSubject,
  method: ModelingMethod,
  modelChangeRequired: boolean | 'unknown',
): void {
  if (!SUBJECTS.has(subject)) {
    throw new Error(`Unsupported modeling subject: ${subject}.`);
  }
  if (!METHODS.has(method)) {
    throw new Error(`Unsupported modeling method: ${method}.`);
  }
  if (![true, false, 'unknown'].includes(modelChangeRequired)) {
    throw new Error(
      `Unsupported model-change requirement: ${String(modelChangeRequired)}.`,
    );
  }
  if (method === 'eight_x_flow' && subject !== 'business') {
    throw new Error('eight_x_flow is only valid for a business system.');
  }
  if (method === 'none' && subject !== 'tool') {
    throw new Error(
      'method=none is only valid for a tool or glue-code subject.',
    );
  }
}

export function proposeModelingProfile(
  cwd: string,
  input: ModelingProfileInput,
  now = new Date().toISOString(),
): WorkflowState {
  const state = requireModelingState(cwd);
  if (state.modeling_stage !== 'profile') {
    throw new Error(
      `A modeling Profile cannot be proposed in ${state.modeling_stage ?? 'unset'}.`,
    );
  }
  validateProfile(input.subject, input.method, input.modelChangeRequired);
  const proposal: ModelingProfileProposal = {
    version: 1,
    subject: input.subject,
    method: input.method,
    model_change_required: input.modelChangeRequired,
    reason: modelingText(input.reason, 'Modeling Profile reason'),
    proposed_at: now,
  };
  return writeState(cwd, {
    ...state,
    modeling_stage: 'profile_review',
    modeling_profile_proposal: proposal,
  });
}

export function confirmModelingProfile(
  cwd: string,
  input: ConfirmModelingProfileInput,
  now = new Date().toISOString(),
): WorkflowState {
  const state = requireModelingState(cwd);
  if (state.modeling_stage !== 'profile_review') {
    throw new Error('No modeling Profile is awaiting a human decision.');
  }
  const proposal = state.modeling_profile_proposal;
  if (!proposal) {
    throw new Error('The AI modeling Profile proposal is missing.');
  }
  const subject = input.subject ?? proposal.subject;
  const method = input.method ?? proposal.method;
  const modelChangeRequired =
    input.modelChangeRequired ??
    (proposal.model_change_required === 'unknown'
      ? undefined
      : proposal.model_change_required);
  if (modelChangeRequired === undefined) {
    throw new Error(
      'The proposed model-change requirement is unknown; the human must explicitly set true or false.',
    );
  }
  validateProfile(subject, method, modelChangeRequired);
  const profile: ConfirmedModelingProfile = {
    version: 1,
    subject,
    method,
    model_change_required: modelChangeRequired,
    reason: input.reason
      ? modelingText(input.reason, 'Modeling Profile confirmation reason')
      : proposal.reason,
    confirmed_by: 'human',
    confirmed_at: now,
    proposal,
  };
  return writeState(cwd, {
    ...state,
    modeling_stage: 'expansion',
    modeling_profile_proposal: undefined,
    modeling_profile: profile,
  });
}
