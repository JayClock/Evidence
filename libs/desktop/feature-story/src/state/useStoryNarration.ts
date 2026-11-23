import { useEffect, useMemo, useRef, useState } from 'react';
import type { FlowScenarioTrace } from '@evidence-poc/evidence-model-core';
import type { EvidenceStoryApi } from '@evidence-poc/desktop-contracts/story';

const RENDERER_DEADLINE_MS = 65_000;

type Narration = {
  key: object;
  snapshotId: string;
  generation: number;
  entries: ReadonlyMap<number, string | undefined>;
  finished: boolean;
  incomplete?: boolean;
};

export const useStoryNarration = (
  api: EvidenceStoryApi,
  snapshotId: string | undefined,
  flow: FlowScenarioTrace | undefined,
  prioritySequence: number | undefined,
  generation: number,
) => {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Narration>();
  const key = useMemo(() => ({}), [api, snapshotId, flow, attempt, generation]);
  const priority = useRef(prioritySequence);
  priority.current = prioritySequence;
  useEffect(() => {
    if (!snapshotId || !flow?.steps.length) return;
    const job = { snapshotId, jobId: globalThis.crypto.randomUUID() };
    let active = true;
    const steps = new Map(
      flow.steps.map(({ sequence, stepHash }) => [sequence, stepHash]),
    );
    const complete = (incomplete: boolean) => {
      clearTimeout(timer);
      setState((prev) =>
        prev?.key === key && !prev.finished
          ? { ...prev, finished: true, incomplete }
          : prev,
      );
    };
    const cancel = () => {
      void api.cancelNarration(job).catch(() => undefined);
    };
    const timer = setTimeout(() => {
      complete(true);
      cancel();
    }, RENDERER_DEADLINE_MS);
    setState((previous) => ({
      key,
      snapshotId,
      generation,
      finished: false,
      // A retry on this snapshot keeps successful prose visible. New snapshots never reuse UI state.
      entries: new Map(
        previous?.snapshotId === snapshotId &&
        previous.generation === generation
          ? [...previous.entries].filter(
              ([, narrative]) => narrative !== undefined,
            )
          : [],
      ),
    }));
    const unsubscribe = api.onNarration((update) => {
      if (
        !active ||
        update.jobId !== job.jobId ||
        update.snapshotId !== job.snapshotId
      )
        return;
      if (update.kind === 'finished') {
        complete(update.reason !== undefined);
      } else if (steps.get(update.sequence) === update.stepHash) {
        setState((prev) => {
          if (prev?.key !== key || prev.finished) return prev;
          const entries = new Map(prev.entries);
          if (update.narrative !== undefined || !entries.has(update.sequence)) {
            entries.set(update.sequence, update.narrative);
          }
          return { ...prev, entries };
        });
      }
    });
    const sequence = priority.current;
    void api
      .startNarration({
        ...job,
        ...(sequence === undefined ? {} : { prioritySequence: sequence }),
      })
      .catch(() => {
        if (active) complete(true);
      });
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
      cancel();
    };
  }, [api, snapshotId, flow, key, generation]);
  const visible = snapshotId && state?.key === key ? state : undefined;
  const total = snapshotId ? (flow?.steps.length ?? 0) : 0;
  const completed = visible?.entries.size ?? 0;
  const failed = [...(visible?.entries.values() ?? [])].filter(
    (narrative) => narrative === undefined,
  ).length;
  return {
    entries: visible?.entries,
    total,
    completed,
    running: total > 0 && !visible?.finished,
    incomplete:
      visible?.finished === true &&
      (Boolean(visible.incomplete) || failed > 0 || completed < total),
    retry: () => setAttempt((value) => value + 1),
  };
};
