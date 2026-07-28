import { describe, expect, it } from 'vitest';
import {
  parseApprovePairRequest,
  parseDecidePairRequest,
  parsePairControllerEvent,
  parseReviewPairRequest,
  parseRunPairRequest,
} from './ipc-protocol';

const sha = `sha256:${'a'.repeat(64)}`;
const request = {
  id: 'pair:request-1',
  workspaceId: 'workspace-1',
  iterationId: 'iteration-1',
};

describe('Pair IPC protocol', () => {
  it('accepts only bounded identity-based run and review requests', () => {
    expect(parseRunPairRequest(request)).toEqual(request);
    expect(
      parseReviewPairRequest({ ...request, expectedManifestSha256: sha }),
    ).toEqual({ ...request, expectedManifestSha256: sha });
    expect(() =>
      parseRunPairRequest({ ...request, iterationId: '../outside' }),
    ).toThrow('Iteration id is invalid');
  });

  it('keeps human routes explicit and excludes approval evidence', () => {
    expect(
      parseDecidePairRequest({
        ...request,
        action: 'back_implementation',
        reason: 'Repair the failed Green behavior.',
        resume: true,
      }),
    ).toMatchObject({ action: 'back_implementation', resume: true });
    expect(() =>
      parseDecidePairRequest({
        ...request,
        action: 'approve',
        reason: 'Do it.',
        resume: false,
      }),
    ).toThrow('Pair decision is invalid');
  });

  it('requires exact review hashes and a bounded Conventional Commit input', () => {
    expect(
      parseApprovePairRequest({
        ...request,
        expectedManifestSha256: sha,
        expectedDiffSha256: sha,
        commitMessage: 'feat(desktop): implement Pair',
        reason: 'Reviewed the complete local diff.',
      }),
    ).toMatchObject({
      expectedManifestSha256: sha,
      expectedDiffSha256: sha,
    });
    expect(() =>
      parseApprovePairRequest({
        ...request,
        expectedManifestSha256: 'not-a-hash',
        expectedDiffSha256: sha,
        commitMessage: 'feat(desktop): implement Pair',
        reason: 'Reviewed it.',
      }),
    ).toThrow('Manifest SHA-256 is invalid');
  });

  it('drops malformed Pair events at the preload boundary', () => {
    expect(
      parsePairControllerEvent({
        requestId: request.id,
        event: 'checkpoint',
        message: 'Pair reached red_observed.',
        checkpoint: 'red_observed',
      }),
    ).toMatchObject({ checkpoint: 'red_observed' });
    expect(
      parsePairControllerEvent({
        requestId: request.id,
        event: 'source-diff',
        message: 'untrusted',
        checkpoint: null,
      }),
    ).toBeNull();
  });
});
