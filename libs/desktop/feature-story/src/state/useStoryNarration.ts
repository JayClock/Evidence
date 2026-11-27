import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import {
  whatIfDecisionRules,
  type DomainGraph,
} from '@evidence-poc/evidence-model-core';
import {
  storyHistoryItem,
  type StoryScene,
} from '@evidence-poc/evidence-agent/browser';
import type {
  EvidenceStoryApi,
  StoryEnrichStepResult,
  StoryStepRequest,
} from '@evidence-poc/desktop-contracts/story';

type Entry = { historyKey: string } & (
  | ({ kind: 'ready' } & Pick<
      StoryEnrichStepResult,
      'narrative' | 'challenges'
    >)
  | { kind: 'miss' | 'failed' }
);
const EMPTY_ENTRIES: ReadonlyMap<number, Entry> = new Map();

/** Plan only the cursor and its immediate successor. No request fills skipped steps. */
const planWindow = (
  scenes: readonly StoryScene[],
  index: number,
  entries: ReadonlyMap<number, Entry>,
  graph: DomainGraph | undefined,
) => {
  const canEnrich = (scene: StoryScene) =>
    scene.narrative.status === 'baseline' ||
    (scene.narrative.status === 'authored' &&
      graph &&
      whatIfDecisionRules(graph, scene.activity.workObject.entityId).length >
        0);
  const history: NonNullable<ReturnType<typeof storyHistoryItem>>[] = [];
  let historyKey = '';
  const entryFor = (scene: StoryScene) => {
    const entry = entries.get(scene.stepIndex);
    return entry?.historyKey === historyKey ? entry : undefined;
  };
  for (const scene of scenes.slice(0, index)) {
    const draft = entryFor(scene);
    const item = storyHistoryItem(
      draft?.kind === 'ready' && scene.narrative.status !== 'authored'
        ? { ...scene, narrative: { ...draft.narrative, status: 'ready' } }
        : scene,
    );
    if (item) {
      historyKey += JSON.stringify(item);
      history.push(item);
    }
  }
  const current = scenes[index];
  const entry = current && entryFor(current);
  if (!current) return { history, historyKey, entry };
  if (canEnrich(current) && !entry)
    return { history, historyKey, entry, target: current };
  const confirmed = storyHistoryItem(
    entry?.kind === 'ready' && current.narrative.status !== 'authored'
      ? { ...current, narrative: { ...entry.narrative, status: 'ready' } }
      : current,
  );
  if (!confirmed) return { history, historyKey, entry };
  history.push(confirmed);
  historyKey += JSON.stringify(confirmed);
  const next = scenes[index + 1];
  return {
    history,
    historyKey,
    entry,
    target: next && canEnrich(next) && !entryFor(next) ? next : undefined,
  };
};

export const useStoryNarration = ({
  api,
  rootPath,
  snapshotId,
  scenes,
  graph,
  index,
  generation,
  cacheOnly,
}: {
  api: EvidenceStoryApi;
  rootPath: string;
  snapshotId: string | undefined;
  scenes: readonly StoryScene[] | undefined;
  graph: DomainGraph | undefined;
  index: number;
  generation: number;
  cacheOnly: boolean;
}) => {
  const scope = useMemo(
    () => ({ api, rootPath, snapshotId, generation, cacheOnly }),
    [api, rootPath, snapshotId, generation, cacheOnly],
  );
  const [settled, setSettled] = useState<{
    scope: typeof scope;
    entries: ReadonlyMap<number, Entry>;
  }>();
  const entries = settled?.scope === scope ? settled.entries : EMPTY_ENTRIES;
  const plan = useMemo(
    () =>
      snapshotId && scenes
        ? planWindow(scenes, index, entries, graph)
        : undefined,
    [snapshotId, scenes, index, entries, graph],
  );
  const target = plan?.target;
  const historyKey = plan?.historyKey ?? '';
  const historyForTarget = useEffectEvent(() => plan?.history ?? []);

  useEffect(() => {
    if (!scope.snapshotId || !target) return;
    const identity: StoryStepRequest = {
      rootPath: scope.rootPath,
      snapshotId: scope.snapshotId,
      requestId: globalThis.crypto.randomUUID(),
      stepIndex: target.stepIndex,
      stepHash: target.stepHash,
    };
    let active = true;
    let finished = false;
    const commit = (entry: Entry) => {
      finished = true;
      if (!active) return;
      setSettled((prior) => {
        const updated = new Map(
          prior?.scope === scope ? prior.entries : undefined,
        );
        updated.set(target.stepIndex, entry);
        return { scope, entries: updated };
      });
    };
    void scope.api
      .enrichStep({
        ...identity,
        storyHistory: historyForTarget(),
        ...(scope.cacheOnly ? { cacheOnly: true } : {}),
      })
      .then(
        (result) => {
          if (
            result &&
            result.stepIndex === identity.stepIndex &&
            result.stepHash === identity.stepHash
          )
            commit({
              kind: 'ready',
              historyKey,
              narrative: result.narrative,
              challenges: result.challenges,
            });
          else
            commit({
              kind: scope.cacheOnly && !result ? 'miss' : 'failed',
              historyKey,
            });
        },
        () => commit({ kind: 'failed', historyKey }),
      );
    return () => {
      active = false;
      if (!finished) void scope.api.cancelStep(identity).catch(() => undefined);
    };
    // The matching prefetch stays in flight when the cursor lands on it: target
    // and historyKey are unchanged even though the window's index has moved.
    // eslint-plugin-react-hooks v5 does not recognize Effect Events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, target, historyKey]);

  const current = scenes?.[index];
  const confirmed = plan?.entry?.kind === 'ready' ? plan.entry : undefined;
  const authored = current?.narrative.status === 'authored';
  return {
    draft: authored ? undefined : confirmed?.narrative,
    challenges: confirmed?.challenges,
    running:
      !authored && !cacheOnly && target !== undefined && target === current,
    incomplete: !authored && plan?.entry?.kind === 'failed',
    retry: () => {
      if (!current || plan?.entry?.kind !== 'failed') return;
      setSettled((prior) => {
        if (
          prior?.scope !== scope ||
          prior.entries.get(current.stepIndex) !== plan.entry
        )
          return prior;
        const updated = new Map(prior.entries);
        updated.delete(current.stepIndex);
        return { scope, entries: updated };
      });
    },
  };
};
