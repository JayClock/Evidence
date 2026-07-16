import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { modelingDecisionEvidencePath } from './completion';

describe('delivery modeling evidence', () => {
  it('uses the no-model-impact artifact as the completed Story decision', () => {
    expect(
      modelingDecisionEvidencePath({
        ...DEFAULT_STATE,
        modeling_profile: {
          version: 1,
          subject: 'tool',
          method: 'none',
          model_change_required: false,
          confirmed_by: 'human',
          confirmed_at: '2026-01-01T00:00:00.000Z',
        },
        model_expansion_path:
          'artifacts/iterations/ITER-0001/02-domain-model/modeling-decisions/US-001-no-model.json',
      }),
    ).toContain('US-001-no-model.json');
  });

  it('uses the human model decision for a modeled Story', () => {
    expect(
      modelingDecisionEvidencePath({
        ...DEFAULT_STATE,
        modeling_profile: {
          version: 1,
          subject: 'domain',
          method: 'object',
          model_change_required: false,
          confirmed_by: 'human',
          confirmed_at: '2026-01-01T00:00:00.000Z',
        },
        model_decisions: [
          {
            version: 1,
            action: 'confirm',
            challenge_artifact_path: 'challenge.json',
            challenge_artifact_sha256: 'challenge-sha',
            projection_sha256: 'projection-sha',
            model_expansion_sha256: 'expansion-sha',
            artifact_path: 'model-decision.json',
            decided_by: 'human',
            decided_at: '2026-01-01T00:01:00.000Z',
          },
        ],
      }),
    ).toBe('model-decision.json');
  });
});
