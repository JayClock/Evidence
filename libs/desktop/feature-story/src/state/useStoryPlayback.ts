import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDomainGraph,
  createRequestRehearsal,
  createScenarioTimeline,
  type FlowScenarioTrace,
  type FlowStepTrace,
  type StoryTimeline,
} from '@evidence-poc/evidence-model-core';
import {
  isFulfillmentRequest,
  timeAttributeOf,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import { previewJourneyStep } from './journeyPreview';
import { evaluateWhatIfCapability } from './whatIfCapability';
import type { WhatIfResult } from '@evidence-poc/evidence-agent/browser';
import type {
  EvidenceStoryApi,
  StorySnapshot,
} from '@evidence-poc/desktop-contracts/story';
import { useStoryNarration } from './useStoryNarration';

export const STORY_REFRESH_DELAY = 180;
export const STORY_STEP_DURATION = 4500;
const EMPTY_FLOWS: readonly FlowScenarioTrace[] = [];

export interface StoryPlaybackOptions {
  api: EvidenceStoryApi;
  rootPath: string;
  document: DomainModelDocument;
  enabled: boolean;
  aiConfigured?: boolean;
  /** A watcher notice received before playback was opened still needs a read. */
  refreshSavedSources?: boolean;
  /** Reload the canvas only when doing so cannot discard local edits. */
  onInvalidated?: () => Promise<void>;
}

const stepRef = (step: FlowStepTrace) =>
  `${step.entityId}#${step.exampleLabel}`;
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** One snapshot for narration, camera focus and sandbox; late replies never win. */
export const useStoryPlayback = ({
  api,
  rootPath,
  document,
  enabled,
  aiConfigured = true,
  refreshSavedSources = false,
  onInvalidated,
}: StoryPlaybackOptions) => {
  const [preferredFlowId, setPreferredFlowId] = useState<string>();
  const [requestedSkipAi, setSkipAi] = useState(false);
  const skipAi = requestedSkipAi || !aiConfigured;
  const [refresh, setRefresh] = useState(0);
  const [sourceRefresh, setSourceRefresh] = useState(0);
  const [invalidating, setInvalidating] = useState(false);
  const [invalidationError, setInvalidationError] = useState<string>();
  const requestKey = useMemo(
    () => ({}),
    [api, rootPath, document, enabled, preferredFlowId, refresh, invalidating],
  );
  const [status, setStatus] = useState<{
    key: object;
    loading: boolean;
    error?: string;
  }>();
  const [loaded, setLoaded] = useState<{
    key: object;
    result: StorySnapshot;
  }>();
  const [position, setPosition] = useState<{ ref?: string; index: number }>({
    index: 0,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [preferRehearsal, setPreferRehearsal] = useState(false);
  const [assumption, setAssumption] = useState<{
    document: DomainModelDocument;
    requestId: string;
    hours: string;
  }>();
  const [cursor, setCursor] = useState<{
    timeline: StoryTimeline;
    time: number;
  }>();
  const flows = loaded?.result.flows ?? EMPTY_FLOWS;
  const activeFlowId =
    flows.find(({ flowId }) => flowId === preferredFlowId)?.flowId ??
    flows[0]?.flowId;
  const loading =
    enabled &&
    !invalidationError &&
    (invalidating || status?.key !== requestKey || status.loading);
  const error =
    invalidationError ??
    (status?.key === requestKey ? status.error : undefined);
  const stale = loaded?.key !== requestKey;
  const flow = loaded?.result.selected?.flow;
  const projection = loaded?.result.selected?.projection;
  const matchingIndex =
    position.ref === undefined
      ? -1
      : (flow?.steps.findIndex((step) => stepRef(step) === position.ref) ?? -1);
  const index =
    matchingIndex >= 0
      ? matchingIndex
      : Math.min(position.index, Math.max(0, (flow?.steps.length ?? 0) - 1));
  const requestOptions = useMemo(
    () => document.entities.filter(isFulfillmentRequest),
    [document],
  );
  const manualRehearsal = preferRehearsal && requestOptions.length > 0;
  const rehearsing =
    enabled &&
    !invalidating &&
    !invalidationError &&
    (manualRehearsal ||
      (!loading && !error && requestOptions.length > 0 && flows.length === 0));
  const selectedRequest =
    requestOptions.find(
      ({ id }) =>
        assumption?.document === document && assumption.requestId === id,
    ) ?? requestOptions[0];
  const windowHours =
    assumption?.document === document &&
    assumption.requestId === selectedRequest?.id
      ? assumption.hours
      : '';
  const hasClockFields =
    selectedRequest !== undefined &&
    Boolean(
      timeAttributeOf(selectedRequest, 'start') &&
        timeAttributeOf(selectedRequest, 'deadline'),
    );
  const exampleTimeline = useMemo(
    () =>
      enabled && !loading && !stale && flow
        ? createScenarioTimeline(document, flow)
        : null,
    [enabled, loading, stale, document, flow],
  );
  const rehearsalTimeline = useMemo(
    () =>
      rehearsing && selectedRequest && windowHours !== ''
        ? createRequestRehearsal(
            document,
            selectedRequest.id,
            Number(windowHours),
          )
        : null,
    [document, rehearsing, selectedRequest, windowHours],
  );
  const timeline = rehearsing ? rehearsalTimeline : exampleTimeline;
  const seekTime =
    timeline && cursor?.timeline === timeline ? cursor.time : undefined;
  const keyframe = flow?.steps[index];
  const currentTime =
    seekTime ??
    (rehearsing
      ? timeline?.start
      : timeline && keyframe
        ? Date.parse(keyframe.asOf)
        : undefined);
  const keyframeIndex =
    !rehearsing && seekTime === undefined ? index : undefined;
  const obligations = useMemo(
    () =>
      timeline && currentTime !== undefined
        ? timeline.at(currentTime, keyframeIndex)
        : [],
    [timeline, currentTime, keyframeIndex],
  );
  const step = rehearsing || seekTime !== undefined ? undefined : keyframe;
  const factScene =
    step &&
    projection?.scenes.find(({ stepIndex }) => stepIndex === step.sequence);
  const ready =
    enabled &&
    (rehearsing
      ? timeline !== null
      : !loading &&
        !error &&
        !stale &&
        flow !== undefined &&
        (step !== undefined || seekTime !== undefined));
  const narration = useStoryNarration(
    api,
    ready && !rehearsing && !skipAi ? loaded?.result.snapshotId : undefined,
    flow,
    step?.sequence,
  );
  const voice =
    factScene && !stale
      ? narration.entries?.get(factScene.stepIndex)
      : undefined;
  const scene =
    factScene && voice !== undefined
      ? { ...factScene, narrative: voice }
      : factScene;
  const nextIndex =
    seekTime === undefined || rehearsing
      ? index + 1
      : (flow?.steps.findIndex(({ asOf }) => Date.parse(asOf) > seekTime) ??
        -1);
  const previousIndex =
    seekTime === undefined || rehearsing
      ? index - 1
      : (flow?.steps.findLastIndex(({ asOf }) => Date.parse(asOf) < seekTime) ??
        -1);

  const journeyPreview = useMemo(
    () =>
      ready && flow && step ? previewJourneyStep(document, flow, step) : null,
    [ready, document, flow, step],
  );

  const canvasFocus = useMemo(() => {
    if (!ready) return null;
    if (!step) {
      const focused =
        obligations.find(({ status }) => status === 'breached') ??
        obligations.find(({ status }) => status === 'overdue') ??
        obligations.at(-1);
      if (!focused) return null;
      const flowKind = focused.responses.some(
        ({ kind }) => kind === 'breach_compensation',
      )
        ? ('breach_compensation' as const)
        : focused.responses.some(({ kind }) => kind === 'escalation')
          ? ('escalation' as const)
          : undefined;
      return {
        activeEntityId: focused.requestId,
        dependencyEntityIds: [],
        relatedEntityIds: focused.responses.map(({ entityId }) => entityId),
        candidateRelationshipIds: focused.responses.map(({ id }) => id),
        flowKind,
        triggeredRuleIds: focused.triggeredRules.map(({ id }) => id),
        focusKey: `time:${focused.key}:${focused.status}`,
      };
    }
    if (!flow || !journeyPreview) return null;
    const dependencyEntityIds = step.basedOn.flatMap((ref) => {
      // Canonical example refs take precedence over declared id/ref aliases.
      const dependency =
        flow.steps.find((candidate) => stepRef(candidate) === ref) ??
        flow.steps.find(
          (candidate) =>
            candidate.values.id === ref || candidate.values.ref === ref,
        );
      return dependency ? [dependency.entityId] : [];
    });
    // Last completed step wins for repeated entities; active still takes precedence.
    const completedSteps = new Map(
      flow.steps
        .slice(0, index)
        .map(({ entityId, sequence }) => [entityId, sequence]),
    );
    return {
      activeEntityId: step.entityId,
      activeStep: step.sequence,
      completedSteps,
      dependencyEntityIds: [...new Set(dependencyEntityIds)],
      relatedEntityIds: journeyPreview.relatedEntityIds,
      activeRelationshipIds: journeyPreview.activeRelationshipIds,
      flowKind: journeyPreview.flowKind,
      triggeredRuleIds: journeyPreview.triggeredRuleIds,
      activeValues: step.values,
      focusKey: `${flow.flowId}:${stepRef(step)}:${step.sequence}:${step.stepHash}`,
    };
  }, [ready, flow, step, index, journeyPreview, obligations]);

  const projectedFlowId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!enabled || invalidating || invalidationError || manualRehearsal)
      return;
    let active = true;
    setIsPlaying(false);
    setStatus({ key: requestKey, loading: true });
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await api.load({
            rootPath,
            document,
            ...(preferredFlowId === undefined ? {} : { preferredFlowId }),
          });
          if (!active) return;
          // If a flow disappeared, its old cursor must not leak into the fallback.
          const flowId = result.selected?.flow.flowId;
          if (projectedFlowId.current !== flowId) setPosition({ index: 0 });
          projectedFlowId.current = flowId;
          setLoaded({ key: requestKey, result });
          setStatus({ key: requestKey, loading: false });
        } catch (cause) {
          if (active)
            setStatus({
              key: requestKey,
              loading: false,
              error: messageOf(cause),
            });
        }
      })();
    }, STORY_REFRESH_DELAY);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    api,
    requestKey,
    rootPath,
    document,
    enabled,
    preferredFlowId,
    invalidating,
    invalidationError,
    manualRehearsal,
  ]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let version = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      const sent = ++version;
      setIsPlaying(false);
      setInvalidating(true);
      setInvalidationError(undefined);
      clearTimeout(timer);
      timer = setTimeout(() => {
        void (async () => {
          try {
            await onInvalidated?.();
            if (active && sent === version) setRefresh((value) => value + 1);
          } catch (cause) {
            if (active && sent === version)
              setInvalidationError(messageOf(cause));
          } finally {
            if (active && sent === version) setInvalidating(false);
          }
        })();
      }, STORY_REFRESH_DELAY);
    };
    const unsubscribe = api.onInvalidated((event) => {
      if (event.rootPath === rootPath) invalidate();
    });
    if (refreshSavedSources || sourceRefresh > 0) invalidate();
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
      setInvalidating(false);
    };
  }, [
    api,
    enabled,
    rootPath,
    onInvalidated,
    refreshSavedSources,
    sourceRefresh,
  ]);

  const moveTo = useCallback(
    (nextIndex: number) => {
      const next = flow?.steps[nextIndex];
      if (next) {
        setCursor(undefined);
        setPosition({ ref: stepRef(next), index: nextIndex });
      }
    },
    [flow],
  );

  useEffect(() => {
    if (!ready || !isPlaying || rehearsing) return;
    if (nextIndex < 0 || nextIndex >= (flow?.steps.length ?? 0)) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => moveTo(nextIndex),
      STORY_STEP_DURATION / speed,
    );
    return () => clearTimeout(timer);
  }, [ready, isPlaying, rehearsing, nextIndex, flow, moveTo, speed]);
  useEffect(() => {
    if (!ready || !isPlaying || !rehearsing || !timeline) return;
    const interval = 100;
    const delta = Math.max(
      1,
      Math.round(
        ((timeline.end - timeline.start) * speed * interval) /
          (2 * STORY_STEP_DURATION),
      ),
    );
    const timer = setInterval(() => {
      setCursor((prior) => ({
        timeline,
        time: Math.min(
          timeline.end,
          (prior?.timeline === timeline ? prior.time : timeline.start) + delta,
        ),
      }));
    }, interval);
    return () => clearInterval(timer);
  }, [ready, isPlaying, rehearsing, timeline, speed]);
  useEffect(() => {
    if (rehearsing && timeline && currentTime === timeline.end)
      setIsPlaying(false);
  }, [rehearsing, timeline, currentTime]);
  useEffect(() => {
    if (!enabled) {
      setIsPlaying(false);
      setCursor(undefined);
      setAssumption(undefined);
      setPreferRehearsal(false);
    }
  }, [enabled]);

  const whatIfGraph = useMemo(
    () => (enabled ? createDomainGraph(document) : null),
    [document, enabled],
  );
  const whatIfCapability = useMemo(
    () =>
      ready && whatIfGraph && flow && step
        ? evaluateWhatIfCapability(whatIfGraph, flow.steps, step)
        : undefined,
    [ready, whatIfGraph, flow, step],
  );
  const jumpToStep = (sequence: number) => {
    if (!ready || rehearsing || !flow) return;
    const target = flow.steps.findIndex((step) => step.sequence === sequence);
    if (target < 0) return;
    setIsPlaying(false);
    moveTo(target);
  };

  // Sandbox state is scoped to the entire displayed revision, not just its step.
  const sandboxKey = useMemo(
    () => ({ requestKey, aiConfigured, step }),
    [requestKey, aiConfigured, step],
  );
  const currentSandboxKey = useRef<typeof sandboxKey | null>(sandboxKey);
  currentSandboxKey.current = sandboxKey;
  const pendingSandbox = useRef<{ key: object } | null>(null);
  const [sandbox, setSandbox] = useState<{
    key: object;
    loading: boolean;
    result?: WhatIfResult;
    error?: string;
  }>();
  const clearWhatIf = useCallback(() => {
    pendingSandbox.current = null;
    setSandbox(undefined);
  }, []);
  const askWhatIf = useCallback(
    async (question: string, { allowSpeculative = false } = {}) => {
      const requiredStatus = allowSpeculative ? 'missing_rules' : 'eligible';
      if (
        !aiConfigured ||
        whatIfCapability?.status !== requiredStatus ||
        !flow ||
        !step ||
        !question.trim() ||
        pendingSandbox.current?.key === sandboxKey
      )
        return;
      const job = { key: sandboxKey };
      pendingSandbox.current = job;
      setIsPlaying(false);
      setSandbox({ key: sandboxKey, loading: true });
      try {
        const result = await api.whatIf({
          rootPath,
          document,
          flowId: flow.flowId,
          currentStepSequence: step.sequence,
          stepHash: step.stepHash,
          question,
          ...(allowSpeculative ? { allowSpeculative: true } : {}),
        });
        if (
          currentSandboxKey.current === sandboxKey &&
          pendingSandbox.current === job
        )
          setSandbox({ key: sandboxKey, loading: false, result });
      } catch (cause) {
        if (
          currentSandboxKey.current === sandboxKey &&
          pendingSandbox.current === job
        )
          setSandbox({
            key: sandboxKey,
            loading: false,
            error: messageOf(cause),
          });
      } finally {
        if (pendingSandbox.current === job) pendingSandbox.current = null;
      }
    },
    [
      api,
      aiConfigured,
      whatIfCapability?.status,
      flow,
      step,
      sandboxKey,
      rootPath,
      document,
    ],
  );
  useEffect(
    () => () => {
      currentSandboxKey.current = null;
    },
    [],
  );

  return {
    flows,
    activeFlowId: rehearsing ? undefined : activeFlowId,
    currentStepSequence: step?.sequence ?? 0,
    currentTime,
    timeline,
    obligations,
    clockUnavailable: !rehearsing && ready && timeline === null,
    rehearsal: {
      active: rehearsing,
      requests: requestOptions,
      requestId: selectedRequest?.id,
      hasClockFields,
      windowHours,
      select: () => {
        setIsPlaying(false);
        setCursor(undefined);
        setPreferRehearsal(true);
      },
      setRequest: (requestId: string) => {
        setIsPlaying(false);
        setAssumption({ document, requestId, hours: '' });
      },
      setWindowHours: (hours: string) => {
        if (!selectedRequest) return;
        setIsPlaying(false);
        setAssumption({ document, requestId: selectedRequest.id, hours });
      },
    },
    speed,
    setSpeed,
    seek: (time: number, stepIndex?: number) => {
      if (!ready || !timeline || !Number.isFinite(time)) return;
      setIsPlaying(false);
      const clamped = Math.max(
        timeline.start,
        Math.min(timeline.end, Math.round(time)),
      );
      const mark =
        !rehearsing &&
        timeline.marks.find(
          (mark) =>
            mark.kind === 'step' &&
            mark.time === clamped &&
            (stepIndex === undefined || mark.stepIndex === stepIndex),
        );
      if (mark && mark.stepIndex !== undefined) moveTo(mark.stepIndex);
      else setCursor({ timeline, time: clamped });
    },
    step,
    scene,
    canvasFocus,
    journeyPreview,
    projection: rehearsing ? undefined : projection,
    loading: !rehearsing && loading,
    error: rehearsing ? undefined : error,
    stale,
    ready,
    skipAi,
    narration,
    hasAiNarration: voice !== undefined,
    isPlaying: ready && isPlaying,
    stepCount: flow?.steps.length ?? 0,
    stepNumber: step ? index + 1 : 0,
    canPrevious: ready && !rehearsing && previousIndex >= 0,
    canNext:
      ready &&
      !rehearsing &&
      nextIndex >= 0 &&
      nextIndex < (flow?.steps.length ?? 0),
    canPlay:
      ready && (rehearsing ? timeline !== null : (flow?.steps.length ?? 0) > 1),
    selectFlow: (flowId: string) => {
      setIsPlaying(false);
      setCursor(undefined);
      setPosition({ index: 0 });
      setPreferRehearsal(false);
      setPreferredFlowId(flowId);
    },
    previous: () => {
      if (ready && !rehearsing && previousIndex >= 0) {
        setIsPlaying(false);
        moveTo(previousIndex);
      }
    },
    next: () => {
      if (
        ready &&
        !rehearsing &&
        nextIndex >= 0 &&
        nextIndex < (flow?.steps.length ?? 0)
      ) {
        setIsPlaying(false);
        moveTo(nextIndex);
      }
    },
    togglePlaying: () => {
      if (!ready) return;
      if (rehearsing) {
        if (!timeline) return;
        if (!isPlaying && currentTime === timeline.end) setCursor(undefined);
      } else {
        if ((flow?.steps.length ?? 0) < 2) return;
        if (
          !isPlaying &&
          (nextIndex < 0 || nextIndex >= (flow?.steps.length ?? 0))
        )
          moveTo(0);
      }
      setIsPlaying((playing) => !playing);
    },
    setSkipAi,
    retry: () => {
      if (invalidationError) setSourceRefresh((value) => value + 1);
      else setRefresh((value) => value + 1);
    },
    whatIfCapability,
    jumpToStep,
    askWhatIf,
    clearWhatIf,
    sandbox: sandbox?.key === sandboxKey ? sandbox : undefined,
  };
};

export type StoryPlaybackController = ReturnType<typeof useStoryPlayback>;
