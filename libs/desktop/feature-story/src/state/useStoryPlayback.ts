import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDomainGraph,
  createRequestRehearsal,
  createScenarioTimeline,
  type DomainGraph,
  type FlowScenarioTrace,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import {
  isFulfillmentRequest,
  timeAttributeOf,
  type DomainModelDocument,
  type RecordBreachOutcomeInput,
} from '@evidence-poc/evidence-schema';
import { previewJourneyStep } from './journeyPreview';
import { sceneChecklist } from './sceneChecklist';
import { branchDestinations, stepRef, storyForks } from './storyForks';
import {
  blockedStoryScenes,
  evaluateWhatIfCapability,
  promotableSceneRequests,
  requestsForProof,
} from './whatIfCapability';
import type {
  StoryScene,
  WhatIfChallenge,
  WhatIfResult,
} from '@evidence-poc/evidence-agent/browser';
import type {
  EvidenceStoryApi,
  StorySnapshot,
} from '@evidence-poc/desktop-contracts/story';
import { useStoryNarration } from './useStoryNarration';

export const STORY_REFRESH_DELAY = 180;
export const STORY_STEP_DURATION = 4500;
const EMPTY_FLOWS: readonly FlowScenarioTrace[] = [];
const EMPTY_SCENES: readonly StoryScene[] = [];

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
  /** Apply an agreed outcome as one reviewable edit and return the new live document. */
  onRecordBreachOutcome?: (
    input: RecordBreachOutcomeInput,
    base: DomainModelDocument,
  ) => DomainModelDocument;
}

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
  onRecordBreachOutcome,
}: StoryPlaybackOptions) => {
  const [preferredFlowId, setPreferredFlowId] = useState<string>();
  const [skipAi, setSkipAi] = useState(false);
  const [narrationGeneration, setNarrationGeneration] = useState(0);
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
    graph: DomainGraph;
  }>();
  const [position, setPosition] = useState<{
    flowId?: string;
    ref?: string;
    index: number;
  }>({ index: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [preferRehearsal, setPreferRehearsal] = useState(false);
  const [assumption, setAssumption] = useState<{
    document: DomainModelDocument;
    requestId: string;
    hours: string;
  }>();
  const [cursor, setCursor] = useState<{
    document: DomainModelDocument;
    clock: string;
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
  // The left endpoint can represent the instant before the first example.
  const seekStart = timeline && timeline.start - (rehearsing ? 0 : 1);
  const clock = rehearsing
    ? `request:${selectedRequest?.id}:${windowHours}`
    : `flow:${flow?.flowId}`;
  const seekTime =
    cursor?.document === document && cursor.clock === clock
      ? timeline && seekStart !== null
        ? Math.min(timeline.end, Math.max(seekStart, cursor.time))
        : cursor.time
      : undefined;
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
      timeline && currentTime !== undefined && currentTime >= timeline.start
        ? timeline.at(currentTime, keyframeIndex)
        : [],
    [timeline, currentTime, keyframeIndex],
  );
  const isBetweenSteps = seekTime !== undefined && !rehearsing;
  const anchoredIndex = isBetweenSteps
    ? (flow?.steps.findLastIndex(({ asOf }) => Date.parse(asOf) <= seekTime) ??
      -1)
    : index;
  const anchoredStep = rehearsing ? undefined : flow?.steps[anchoredIndex];
  const step = isBetweenSteps ? undefined : anchoredStep;
  const scenes = rehearsing
    ? EMPTY_SCENES
    : (projection?.scenes ?? EMPTY_SCENES);
  const anchoredFacts =
    anchoredStep &&
    scenes.find(({ stepIndex }) => stepIndex === anchoredStep.sequence);
  const factScene = step && anchoredFacts;
  const graph = loaded?.graph;
  const forksByStep = useMemo(
    () => (graph && flow ? storyForks(graph, flows, flow) : undefined),
    [graph, flows, flow],
  );
  const anchoredChecklist = useMemo(
    () =>
      graph && flow && anchoredFacts
        ? sceneChecklist(graph, flow, anchoredFacts)
        : undefined,
    [graph, flow, anchoredFacts],
  );
  const sceneRequests = useMemo(() => {
    if (!anchoredFacts || !graph) return undefined;
    return anchoredFacts.activity.workObject.entityKind === 'other_evidence'
      ? requestsForProof(graph, scenes, anchoredFacts)
      : anchoredFacts.activity.fulfillment && anchoredChecklist?.requests;
  }, [graph, scenes, anchoredFacts, anchoredChecklist]);
  const sceneRequestKeys = useMemo(() => {
    if (!flow || !sceneRequests) return undefined;
    const steps = new Set(sceneRequests.map(({ stepIndex }) => stepIndex));
    return new Set(
      flow.steps.filter(({ sequence }) => steps.has(sequence)).map(stepRef),
    );
  }, [sceneRequests, flow]);
  const focusedObligations = useMemo(
    () =>
      step && sceneRequestKeys
        ? obligations.filter(({ key }) => sceneRequestKeys.has(key))
        : obligations,
    [step, sceneRequestKeys, obligations],
  );
  const ready =
    enabled &&
    (rehearsing
      ? timeline !== null
      : !loading &&
        !error &&
        !stale &&
        flow !== undefined &&
        (step !== undefined || seekTime !== undefined));
  const narration = useStoryNarration({
    api,
    rootPath,
    snapshotId:
      ready && anchoredFacts && !skipAi ? loaded?.result.snapshotId : undefined,
    scenes,
    graph,
    index: anchoredIndex,
    generation: narrationGeneration,
    cacheOnly: !aiConfigured,
  });
  const anchoredScene: StoryScene | undefined =
    anchoredFacts && narration.draft
      ? { ...anchoredFacts, narrative: { ...narration.draft, status: 'ready' } }
      : anchoredFacts && narration.running
        ? {
            ...anchoredFacts,
            narrative: { ...anchoredFacts.narrative, status: 'enriching' },
          }
        : anchoredFacts;
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
    const activity = factScene?.activity;
    const activeRoleIds = new Set<string>();
    const addRole = (id: string | undefined) => {
      if (id) activeRoleIds.add(id);
    };
    addRole(activity?.actor.roleId);
    addRole(activity?.recipient?.roleId);
    for (const { rightHolder, obligor } of activity?.fulfillment?.requests ??
      []) {
      addRole(rightHolder?.roleId);
      addRole(obligor?.roleId);
    }
    return {
      activeEntityId: step.entityId,
      activeRoleIds: [...activeRoleIds],
      activityLabel: activity
        ? `${activity.actor.roleLabel}${activity.actionPhrase}`
        : undefined,
      activeStep: step.sequence,
      completedSteps,
      dependencyEntityIds: [...new Set(dependencyEntityIds)],
      relatedEntityIds: journeyPreview.relatedEntityIds,
      activeRelationshipIds: journeyPreview.activeRelationshipIds,
      flowKind: journeyPreview.flowKind,
      triggeredRuleIds: [
        ...new Set([
          ...journeyPreview.triggeredRuleIds,
          ...focusedObligations.flatMap(({ triggeredRules }) =>
            triggeredRules.map(({ id }) => id),
          ),
        ]),
      ],
      activeValues: step.values,
      focusKey: `${flow.flowId}:${stepRef(step)}:${step.sequence}:${step.stepHash}`,
    };
  }, [
    ready,
    flow,
    step,
    index,
    journeyPreview,
    obligations,
    focusedObligations,
    factScene,
  ]);

  const projectedFlowId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!enabled || invalidating || invalidationError) return;
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
          if (projectedFlowId.current !== flowId)
            setPosition((current) =>
              current.flowId === flowId ? current : { index: 0 },
            );
          projectedFlowId.current = flowId;
          setLoaded({
            key: requestKey,
            result,
            graph: createDomainGraph(document),
          });
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
      if (event.rootPath !== rootPath) return;
      if (event.kind === 'narration')
        setNarrationGeneration((value) => value + 1);
      else invalidate();
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
        setPosition({
          flowId: flow.flowId,
          ref: stepRef(next),
          index: nextIndex,
        });
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
        document,
        clock,
        time: Math.min(
          timeline.end,
          (prior?.document === document && prior.clock === clock
            ? prior.time
            : timeline.start) + delta,
        ),
      }));
    }, interval);
    return () => clearInterval(timer);
  }, [ready, isPlaying, rehearsing, timeline, speed, document, clock]);
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

  const localCapability = useMemo(
    () =>
      ready && graph && flow && anchoredStep
        ? evaluateWhatIfCapability(graph, flow.steps, anchoredStep)
        : undefined,
    [ready, graph, flow, anchoredStep],
  );
  const whatIfCapability = useMemo(() => {
    if (localCapability?.status !== 'eligible') return localCapability;
    const enriched = narration.challenges?.filter(
      (card) => aiConfigured || card.hypothesisDraft,
    );
    if (!enriched?.length) return localCapability;
    const fallback = localCapability.challenges.filter(
      (local) =>
        !enriched.some(
          (card) =>
            card.id === local.id ||
            card.question === local.question ||
            (card.category === local.category &&
              card.targetedRuleId === local.targetedRuleId),
        ),
    );
    return { ...localCapability, challenges: [...enriched, ...fallback] };
  }, [localCapability, narration.challenges, aiConfigured]);
  const jumpToStep = (sequence: number) => {
    if (!ready || rehearsing || !flow) return;
    const target = flow.steps.findIndex((step) => step.sequence === sequence);
    if (target < 0) return;
    setIsPlaying(false);
    moveTo(target);
  };
  const openAtEntityExample = useCallback(
    (entityId: string) => {
      if (ready && flow && !rehearsing) {
        const target =
          anchoredStep?.entityId === entityId
            ? anchoredIndex
            : flow.steps.findIndex((step) => step.entityId === entityId);
        if (target >= 0) {
          setIsPlaying(false);
          moveTo(target);
          return true;
        }
      }
      const examples = document.entities.find(
        ({ id }) => id === entityId,
      )?.examples;
      const selected =
        examples?.find(
          ({ label, test }) =>
            anchoredStep?.entityId === entityId &&
            test?.flow === activeFlowId &&
            label === anchoredStep.exampleLabel,
        ) ??
        examples?.find(({ test }) => test && test.flow === activeFlowId) ??
        examples?.find(({ test }) => test?.flow);
      if (!selected?.test) return false;
      const flowId = selected.test.flow;
      setIsPlaying(false);
      setCursor(undefined);
      setPosition({ flowId, ref: `${entityId}#${selected.label}`, index: 0 });
      setPreferRehearsal(false);
      setPreferredFlowId(flowId);
      return true;
    },
    [
      ready,
      flow,
      rehearsing,
      anchoredStep,
      anchoredIndex,
      moveTo,
      document,
      activeFlowId,
    ],
  );

  // Sandbox state is scoped to the entire displayed revision, not just its step.
  const sceneScope = useMemo(
    () => ({}),
    [
      requestKey,
      aiConfigured,
      narrationGeneration,
      anchoredStep,
      clock,
      seekTime,
    ],
  );
  const [sceneCursor, setSceneCursor] = useState<{
    scope: object;
    time: number;
  }>();
  const trialTime =
    sceneCursor?.scope === sceneScope ? sceneCursor.time : undefined;
  const assumedTime = trialTime ?? seekTime;
  const sceneTime = assumedTime ?? currentTime;
  const sceneClock = useMemo(() => {
    if (!exampleTimeline || !anchoredStep || sceneTime === undefined)
      return undefined;
    const start = Date.parse(anchoredStep.asOf);
    const visible = exampleTimeline.at(
      sceneTime,
      anchoredIndex,
      stepRef(anchoredStep),
    );
    const obligations = visible.filter(({ key }) => sceneRequestKeys?.has(key));
    const end = obligations.reduce(
      (last, { deadline }) =>
        deadline === undefined ? last : Math.max(last, deadline + 3_600_000),
      Math.max(start, sceneTime),
    );
    return {
      start,
      end: Math.min(end, exampleTimeline.end),
      time: sceneTime,
      obligations,
    };
  }, [
    exampleTimeline,
    anchoredStep,
    anchoredIndex,
    sceneRequestKeys,
    sceneTime,
  ]);
  const sandboxKey = useMemo(() => ({}), [sceneScope, trialTime]);
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
    async (
      question: string,
      {
        allowSpeculative = false,
        challenge,
      }: { allowSpeculative?: boolean; challenge?: WhatIfChallenge } = {},
    ) => {
      const picked =
        !allowSpeculative && challenge?.question === question
          ? challenge
          : undefined;
      const requiredStatus = allowSpeculative ? 'missing_rules' : 'eligible';
      if (
        (!aiConfigured && !picked?.hypothesisDraft) ||
        whatIfCapability?.status !== requiredStatus ||
        !flow ||
        !anchoredStep ||
        !question.trim() ||
        currentSandboxKey.current !== sandboxKey ||
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
          currentStepSequence: anchoredStep.sequence,
          stepHash: anchoredStep.stepHash,
          question,
          ...(assumedTime === undefined
            ? {}
            : { asOf: new Date(assumedTime).toISOString() }),
          ...(picked?.hypothesisDraft
            ? { hypothesisDraft: picked.hypothesisDraft }
            : {}),
          ...(picked?.targetedRuleId
            ? { targetedRuleId: picked.targetedRuleId }
            : {}),
          ...(!aiConfigured ? { localOnly: true } : {}),
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
      anchoredStep,
      sandboxKey,
      rootPath,
      document,
      assumedTime,
    ],
  );
  useEffect(
    () => () => {
      currentSandboxKey.current = null;
    },
    [],
  );

  const currentSandbox = sandbox?.key === sandboxKey ? sandbox : undefined;
  const writable = onRecordBreachOutcome !== undefined;
  const sandboxRequests = useMemo(
    () =>
      currentSandbox?.result && sceneRequests && graph
        ? promotableSceneRequests(graph, sceneRequests, currentSandbox.result)
        : [],
    [currentSandbox?.result, sceneRequests, graph],
  );
  const clockBreaches = useMemo(() => {
    if (
      currentSandbox ||
      (trialTime === undefined && !isBetweenSteps && !rehearsing)
    )
      return [];
    return (sceneClock?.obligations ?? (rehearsing ? obligations : [])).filter(
      ({ status }) => status === 'breached',
    );
  }, [
    currentSandbox,
    trialTime,
    isBetweenSteps,
    rehearsing,
    sceneClock,
    obligations,
  ]);
  const result = currentSandbox?.result;
  const hasSandboxBreach =
    !!result &&
    !result.isSpeculative &&
    result.ruleOutcomes.some(({ kind, result }) => kind === 'breach' && result);
  const breachedStep =
    hasSandboxBreach || clockBreaches.length
      ? anchoredStep?.sequence
      : undefined;
  const blockedScenes = useMemo(
    () => blockedStoryScenes(scenes, breachedStep),
    [scenes, breachedStep],
  );
  const nextStep = flow?.steps[nextIndex];
  const nextBlocked =
    nextStep !== undefined && blockedScenes.has(nextStep.sequence);
  const promotionRequests = useMemo(() => {
    if (!ready || !writable) return [];
    const ids = new Set(sandboxRequests.map(({ id }) => id));
    for (const obligation of clockBreaches) ids.add(obligation.requestId);
    return requestOptions.filter(({ id }) => ids.has(id));
  }, [ready, writable, clockBreaches, requestOptions, sandboxRequests]);

  // A newly modeled branch is a possible response, not an event in the example.
  const [promoted, setPromoted] = useState<{
    document: DomainModelDocument;
    parent: string;
    focus: typeof canvasFocus;
    entityIds: string[];
    relationshipIds: string[];
  }>();
  const parent = anchoredStep ? stepRef(anchoredStep) : clock;
  const promoteBreachOutcome = async (
    input: RecordBreachOutcomeInput,
  ): Promise<void> => {
    if (
      !onRecordBreachOutcome ||
      currentSandboxKey.current !== sandboxKey ||
      !promotionRequests.some(({ id }) => id === input.requestRef)
    )
      throw new Error('当前步骤或推演结果已变化，请重新核对。');
    setIsPlaying(false);
    const after = onRecordBreachOutcome(
      anchoredStep
        ? { ...input, forkExampleRef: stepRef(anchoredStep) }
        : input,
      document,
    );
    if (step && flow)
      setPosition({ flowId: flow.flowId, ref: stepRef(step), index });
    if (rehearsing) {
      setPreferRehearsal(true);
      setAssumption({
        document: after,
        requestId: input.requestRef,
        hours: windowHours,
      });
    }
    if (seekTime !== undefined)
      setCursor({ document: after, clock, time: seekTime });
    const added =
      input.outcome.kind === 'compensation_pair'
        ? [input.outcome.request.id, input.outcome.confirmation.id]
        : [input.outcome.handoff.id];
    const branchEdges = after.relationships.filter(
      (edge) =>
        added.includes(edge.sourceRef) &&
        (edge.targetRef === input.requestRef || added.includes(edge.targetRef)),
    );
    setPromoted({
      document: after,
      parent,
      focus: canvasFocus,
      entityIds: added,
      relationshipIds: branchEdges.map(({ id }) => id),
    });
  };
  const promotedBranch = useMemo(() => {
    if (
      !enabled ||
      !promoted ||
      promoted.parent !== parent ||
      promoted.document !== document ||
      stale
    )
      return undefined;
    const entity = graph?.getEntity(promoted.entityIds[0]!);
    if (!entity) return undefined;
    const destination = branchDestinations(
      flows,
      promoted.entityIds,
      flow?.flowId,
      anchoredStep?.sequence,
    ).at(0);
    return { entity, ...destination };
  }, [
    enabled,
    promoted,
    parent,
    document,
    stale,
    graph,
    flows,
    flow,
    anchoredStep,
  ]);
  const showPromotedFocus =
    enabled &&
    promoted?.document === document &&
    promoted.focus !== null &&
    (canvasFocus
      ? canvasFocus.focusKey === promoted.focus.focusKey
      : loading && !error);
  const displayFocus =
    canvasFocus ?? (showPromotedFocus ? promoted.focus : null);

  return {
    flows,
    activeFlowId: rehearsing ? undefined : activeFlowId,
    currentStepSequence: step?.sequence ?? 0,
    snapshotId: ready && !rehearsing ? loaded?.result.snapshotId : undefined,
    currentTime,
    sceneClock,
    setSceneTime: (time: number) => {
      if (!ready || !sceneClock || !Number.isFinite(time)) return;
      setIsPlaying(false);
      clearWhatIf();
      setSceneCursor({
        scope: sceneScope,
        time: Math.max(
          sceneClock.start,
          Math.min(sceneClock.end, Math.round(time)),
        ),
      });
    },
    timeline,
    seekStart,
    obligations,
    focusedObligations,
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
      if (!ready || !timeline || seekStart === null || !Number.isFinite(time))
        return;
      setIsPlaying(false);
      const clamped = Math.max(
        seekStart,
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
      else setCursor({ document, clock, time: clamped });
    },
    step,
    scene: step && anchoredScene,
    checklist: step && anchoredChecklist,
    scenes,
    isBetweenSteps,
    anchoredStep,
    anchoredScene,
    anchoredChecklist,
    forksByStep,
    promotedBranch,
    canvasFocus:
      showPromotedFocus && displayFocus
        ? {
            ...displayFocus,
            relatedEntityIds: [
              ...displayFocus.relatedEntityIds,
              ...promoted.entityIds,
            ],
            candidateRelationshipIds: [
              ...(displayFocus.candidateRelationshipIds ?? []),
              ...promoted.relationshipIds,
            ],
          }
        : canvasFocus,
    journeyPreview,
    projection: rehearsing ? undefined : projection,
    loading: !rehearsing && loading,
    error: rehearsing ? undefined : error,
    stale,
    ready,
    skipAi,
    narration,
    isPlaying: ready && isPlaying,
    stepCount: flow?.steps.length ?? 0,
    stepNumber: step ? index + 1 : 0,
    canPrevious: ready && !rehearsing && previousIndex >= 0,
    canNext:
      ready &&
      !rehearsing &&
      !nextBlocked &&
      nextIndex >= 0 &&
      nextIndex < (flow?.steps.length ?? 0),
    canPlay:
      ready &&
      !nextBlocked &&
      (rehearsing ? timeline !== null : (flow?.steps.length ?? 0) > 1),
    selectFlow: (flowId: string, atStep?: FlowStepTrace) => {
      setIsPlaying(false);
      setCursor(undefined);
      setPosition({ flowId, ref: atStep && stepRef(atStep), index: 0 });
      setPreferRehearsal(false);
      setPreferredFlowId(flowId);
    },
    openAtEntityExample,
    openAtRequest: (requestId: string) => {
      const request = requestOptions.find(({ id }) => id === requestId);
      if (!request || openAtEntityExample(requestId)) return;
      setIsPlaying(false);
      setCursor(undefined);
      setAssumption({ document, requestId, hours: '' });
      setPreferRehearsal(true);
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
        !nextBlocked &&
        nextIndex >= 0 &&
        nextIndex < (flow?.steps.length ?? 0)
      ) {
        setIsPlaying(false);
        moveTo(nextIndex);
      }
    },
    togglePlaying: () => {
      if (!ready || nextBlocked) return;
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
    sandbox: currentSandbox,
    promotionRequests,
    hasSandboxBreach,
    breachedStep,
    blockedScenes,
    resetSceneTrial: () => {
      clearWhatIf();
      setSceneCursor(undefined);
      if (isBetweenSteps && anchoredStep) jumpToStep(anchoredStep.sequence);
    },
    promoteBreachOutcome,
  };
};

export type StoryPlaybackController = ReturnType<typeof useStoryPlayback>;
