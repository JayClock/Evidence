import {
  DynamicBorder,
  type ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import {
  Container,
  type SelectItem,
  SelectList,
  Text,
} from '@earendil-works/pi-tui';
import type { InboxStoryCandidate } from '../../capabilities/inbox/model';
import {
  inboxCandidateStatus,
  listInboxStoryCandidates,
} from '../../capabilities/inbox/story-candidate';

const PICKER_TITLE = 'Select an Inbox Story candidate for the new iteration';

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function candidateLabel(candidate: InboxStoryCandidate): string {
  return `${candidate.candidate_id} · ${candidate.title} · ${candidate.role}`;
}

function fallbackCandidateLabel(candidate: InboxStoryCandidate): string {
  return `${candidateLabel(candidate)} · Problem: ${singleLine(candidate.problem)}`;
}

async function showCandidatePicker(
  ctx: ExtensionCommandContext,
  candidates: InboxStoryCandidate[],
): Promise<string | undefined> {
  const items: SelectItem[] = candidates.map((candidate) => ({
    value: candidate.candidate_id,
    label: candidateLabel(candidate),
    description: `Problem: ${singleLine(candidate.problem)}`,
  }));
  const result = await ctx.ui.custom<string | null>(
    (tui, theme, _keybindings, done) => {
      const selectList = new SelectList(
        items,
        Math.min(items.length, 8),
        {
          selectedPrefix: (text) => theme.fg('accent', text),
          selectedText: (text) => theme.fg('accent', text),
          description: (text) => theme.fg('muted', text),
          scrollInfo: (text) => theme.fg('dim', text),
          noMatch: (text) => theme.fg('warning', text),
        },
        { minPrimaryColumnWidth: 28, maxPrimaryColumnWidth: 48 },
      );
      selectList.onSelect = (item) => done(item.value);
      selectList.onCancel = () => done(null);

      return {
        render(width: number): string[] {
          const selectedId = selectList.getSelectedItem()?.value;
          const selected =
            candidates.find(
              ({ candidate_id }) => candidate_id === selectedId,
            ) ?? candidates[0];
          const container = new Container();
          container.addChild(
            new DynamicBorder((text: string) => theme.fg('accent', text)),
          );
          container.addChild(
            new Text(theme.fg('accent', theme.bold(PICKER_TITLE)), 1, 0),
          );
          container.addChild(
            new Text(
              theme.fg(
                'muted',
                'Choose the user or business problem to take into one iteration.',
              ),
              1,
              0,
            ),
          );
          container.addChild(selectList);
          container.addChild(
            new DynamicBorder((text: string) => theme.fg('muted', text)),
          );
          container.addChild(
            new Text(
              theme.fg('accent', theme.bold('Selected candidate problem')),
              1,
              0,
            ),
          );
          container.addChild(
            new Text(
              theme.fg(
                'text',
                selected?.problem ?? 'No candidate problem is available.',
              ),
              1,
              0,
            ),
          );
          container.addChild(
            new Text(
              theme.fg('dim', '↑↓ navigate · enter select · esc cancel'),
              1,
              0,
            ),
          );
          container.addChild(
            new DynamicBorder((text: string) => theme.fg('accent', text)),
          );
          return container.render(width);
        },
        invalidate(): void {
          selectList.invalidate();
        },
        handleInput(data: string): void {
          selectList.handleInput(data);
          tui.requestRender();
        },
      };
    },
  );
  return result ?? undefined;
}

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
    (candidate) => inboxCandidateStatus(ctx.cwd, candidate) === 'ready',
  );
  if (ready.length === 0) {
    throw new Error(
      'No ready Inbox Story candidate exists. Add sources and run /evidence-inbox extract first.',
    );
  }
  const supportsCustom =
    typeof (ctx.ui as unknown as { custom?: unknown }).custom === 'function';
  if (ctx.mode === 'tui' && supportsCustom) {
    const selected = await showCandidatePicker(ctx, ready);
    return selected ? requireCandidateId(selected) : undefined;
  }

  const selected = await ctx.ui.select(
    PICKER_TITLE,
    ready.map(fallbackCandidateLabel),
  );
  return selected ? requireCandidateId(selected.split(' · ')[0]) : undefined;
}
