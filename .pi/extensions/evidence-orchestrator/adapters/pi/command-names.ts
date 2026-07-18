export const EVIDENCE_COMMANDS = {
  status: 'evidence-status',
  newIteration: 'evidence-new',
  flow: 'evidence-flow',
  answer: 'evidence-answer',
  inbox: 'evidence-inbox',
  kickoff: 'evidence-kickoff',
  scenario: 'evidence-scenario',
  modelingProfile: 'evidence-modeling-profile',
  model: 'evidence-model',
  deskCheck: 'evidence-desk-check',
  run: 'evidence-run',
  pair: 'evidence-pair',
  explainDiff: 'evidence-explain-diff',
  showcase: 'evidence-showcase',
  respond: 'evidence-respond',
} as const;

export const EVIDENCE_COMMAND_NAMES = Object.freeze(
  Object.values(EVIDENCE_COMMANDS),
);
