import type { PrismaStore } from './types';

export type WorkspaceReferenceKind =
  | 'extraction'
  | 'candidate'
  | 'decision'
  | 'iteration'
  | 'kickoff';

const REFERENCE_PREFIX: Record<WorkspaceReferenceKind, string> = {
  extraction: 'EXTRACT',
  candidate: 'CAND',
  decision: 'DECISION',
  iteration: 'ITER',
  kickoff: 'KICKOFF',
};

export async function allocateWorkspaceReference(
  store: PrismaStore,
  workspaceId: string,
  kind: WorkspaceReferenceKind,
  now: Date,
): Promise<string> {
  const row = await store.workspaceSequence.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      ...initialCounters(kind),
      updatedAt: now,
    },
    update: {
      [counterField(kind)]: { increment: 1 },
      updatedAt: now,
    },
  });
  const next = row[counterField(kind)];
  return `${REFERENCE_PREFIX[kind]}-${String(next - 1).padStart(4, '0')}`;
}

function initialCounters(kind: WorkspaceReferenceKind) {
  return {
    nextExtractionNumber: kind === 'extraction' ? 2 : 1,
    nextCandidateNumber: kind === 'candidate' ? 2 : 1,
    nextDecisionNumber: kind === 'decision' ? 2 : 1,
    nextIterationNumber: kind === 'iteration' ? 2 : 1,
    nextKickoffNumber: kind === 'kickoff' ? 2 : 1,
  };
}

function counterField(
  kind: WorkspaceReferenceKind,
):
  | 'nextExtractionNumber'
  | 'nextCandidateNumber'
  | 'nextDecisionNumber'
  | 'nextIterationNumber'
  | 'nextKickoffNumber' {
  switch (kind) {
    case 'extraction':
      return 'nextExtractionNumber';
    case 'candidate':
      return 'nextCandidateNumber';
    case 'decision':
      return 'nextDecisionNumber';
    case 'iteration':
      return 'nextIterationNumber';
    case 'kickoff':
      return 'nextKickoffNumber';
  }
}
