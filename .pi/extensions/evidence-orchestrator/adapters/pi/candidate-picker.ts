import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import {
  inboxCandidateReadiness,
  listInboxStoryCandidates,
} from '../../capabilities/inbox/story-candidate';

export function requireCandidateId(value: string): string {
  const candidateId = value.trim().toUpperCase();
  if (!/^CAND-\d{4,}$/.test(candidateId)) {
    throw new Error('Iteration candidate must be CAND-xxxx.');
  }
  return candidateId;
}

export async function selectReadyInboxCandidate(
  ctx: ExtensionCommandContext,
): Promise<string | undefined> {
  if (!ctx.hasUI) {
    throw new Error(
      '/evidence-new requires CAND-xxxx outside interactive mode.',
    );
  }
  const ready = listInboxStoryCandidates(ctx.cwd).filter(
    (candidate) => inboxCandidateReadiness(ctx.cwd, candidate) === 'ready',
  );
  if (ready.length === 0) {
    throw new Error(
      'No ready Inbox Story candidate exists. Add sources and run /evidence-inbox extract first.',
    );
  }
  const selected = await ctx.ui.select(
    'Select an Inbox Story candidate for the new iteration',
    ready.map(
      ({ candidate_id, title, role }) => `${candidate_id} · ${title} · ${role}`,
    ),
  );
  return selected ? requireCandidateId(selected.split(' · ')[0]) : undefined;
}
