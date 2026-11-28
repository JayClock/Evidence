import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDomainGraph,
  type DomainGraph,
  type FlowScenarioTrace,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import {
  isFulfillmentRequest,
  type DomainModelDocument,
  type RecordBreachOutcomeInput,
} from '@evidence-poc/evidence-schema';
import { previewJourneyStep } from './journeyPreview';
import { sceneChecklist } from './sceneChecklist';
import { stepRef, storyForks } from './storyForks';
import {
  blockedStoryScenes,
  evaluateWhatIfCapability,
  hasWhatIfBreach,
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
  const flows = loaded?.result.flows ?? EMPTY_FLOWS;
  const activeFlowId =
    flows.find(({ flowId }) => flowId === preferredFlowId)?.flowId ??
    loaded?.result.selected?.flow.flowId;
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
  const step = flow?.steps[index];
  const nextIndex = index + 1;
  const previousIndex = index - 1;
  const scenes = projection?.scenes ?? EMPTY_SCENES;
  const factScene =
    step && scenes.find(({ stepIndex }) => stepIndex === step.sequence);
  const graph = loaded?.graph;
  const forksByStep = useMemo(
    () => (flow ? storyForks(flows, flow) : undefined),
    [flows, flow],
  );
  const checklist = useMemo(
    () =>
      graph && flow && factScene
        ? sceneChecklist(graph, flow, factScene)
        : undefined,
    [graph, flow, factScene],
  );
  const ready =
    enabled &&
    !loading &&
    !error &&
    !stale &&
    flow !== undefined &&
    step !== undefined;
  const narration = useStoryNarration({
    api,
    rootPath,
    snapshotId:
      ready && factScene && !skipAi ? loaded?.result.snapshotId : undefined,
    scenes,
    graph,
    index,
    generation: narrationGeneration,
    cacheOnly: !aiConfigured,
  });
  const scene: StoryScene | undefined =
    factScene && narration.draft
      ? { ...factScene, narrative: { ...narration.draft, status: 'ready' } }
      : factScene && narration.running
        ? {
            ...factScene,
            narrative: { ...factScene.narrative, status: 'enriching' },
          }
        : factScene;

  const journeyPreview = useMemo(
    () => (ready ? previewJourneyStep(document, flow, step) : null),
    [ready, document, flow, step],
  );

  const canvasFocus = useMemo(() => {
    if (!ready || !journeyPreview) return null;
    const dependencyEntityIds = step.basedOn.flatMap((ref) => {
      const dependency = flow.steps.find(
        (candidate) => stepRef(candidate) === ref,
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
      triggeredRuleIds: journeyPreview.triggeredRuleIds,
      activeValues: step.values,
      focusKey: `${flow.flowId}:${stepRef(step)}:${step.sequence}:${step.stepHash}`,
    };
  }, [ready, flow, step, index, journeyPreview, factScene]);

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
          const flowId = result.selected?.flow.flowId;
          if (projectedFlowId.current !== flowId)
            setPosition((current) =>
              current.flowId === flowId
                ? current
                : {
                    flowId,
                    index: Math.max(
                      0,
                      result.selected?.flow.steps.findIndex(
                        (step) => !step.inherited,
                      ) ?? 0,
                    ),
                  },
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
        setPosition({
          flowId: flow.flowId,
          ref: stepRef(next),
          index: nextIndex,
        });
      }
    },
    [flow],
  );

  const localCapability = useMemo(
    () =>
      ready && graph
        ? evaluateWhatIfCapability(graph, flow.steps, step)
        : undefined,
    [ready, graph, flow, step],
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
    if (!ready) return;
    const target = flow.steps.findIndex((step) => step.sequence === sequence);
    if (target < 0) return;
    setIsPlaying(false);
    moveTo(target);
  };
  const openAtEntityExample = useCallback(
    (entityId: string) => {
      if (ready) {
        const target =
          step.entityId === entityId
            ? index
            : flow.steps.findIndex(
                (candidate) => candidate.entityId === entityId,
              );
        if (target >= 0) {
          setIsPlaying(false);
          moveTo(target);
          return true;
        }
      }
      const hasStep = (story: DomainModelDocument['stories'][number]) =>
        story.steps.some((s) => s.workObjectRef === entityId);
      const story =
        document.stories.find((s) => s.id === activeFlowId && hasStep(s)) ??
        document.stories.find(hasStep);
      const selected = story?.steps.find((s) => s.workObjectRef === entityId);
      if (!story || !selected) return false;
      const flowId = story.id;
      setIsPlaying(false);
      setPosition({ flowId, ref: `${flowId}#${selected.id}`, index: 0 });
      setPreferredFlowId(flowId);
      return true;
    },
    [ready, flow, step, index, moveTo, document, activeFlowId],
  );

  // Sandbox state is scoped to the entire displayed revision, not just its step.
  const sandboxKey = useMemo(
    () => ({}),
    [requestKey, aiConfigured, narrationGeneration, step],
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
        !step ||
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
          currentStep: { storyId: step.storyId, stepId: step.stepId },
          stepHash: step.stepHash,
          question,
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

  const currentSandbox = sandbox?.key === sandboxKey ? sandbox : undefined;
  const result = currentSandbox?.result;
  const hasSandboxBreach = !!step && !!result && hasWhatIfBreach(step, result);
  const breachedStep = hasSandboxBreach ? step.sequence : undefined;
  const blockedScenes = useMemo(
    () => blockedStoryScenes(scenes, breachedStep),
    [scenes, breachedStep],
  );
  const nextStep = flow?.steps[nextIndex];
  const nextBlocked =
    nextStep !== undefined && blockedScenes.has(nextStep.sequence);
  const canNext = ready && nextStep !== undefined && !nextBlocked;
  useEffect(() => {
    if (!isPlaying) return;
    if (!canNext) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => moveTo(nextIndex),
      STORY_STEP_DURATION / speed,
    );
    return () => clearTimeout(timer);
  }, [isPlaying, canNext, nextIndex, moveTo, speed]);

  const writable = onRecordBreachOutcome !== undefined;
  const promotionRequests = useMemo(() => {
    if (!ready || step.inherited || !writable || !hasSandboxBreach || !graph)
      return [];
    if (step.entityKind === 'fulfillment_request') {
      const request = graph.fulfillmentPair(step.entityId)?.request;
      return request ? [request] : [];
    }
    const sceneRequests =
      factScene?.activity.workObject.entityKind === 'other_evidence'
        ? requestsForProof(graph, scenes, factScene)
        : (checklist?.requests ?? []);
    const sandboxRequests = promotableSceneRequests(
      graph,
      sceneRequests,
      result,
    );
    const ids = new Set(sandboxRequests.map(({ id }) => id));
    return document.entities
      .filter(isFulfillmentRequest)
      .filter(({ id }) => ids.has(id));
  }, [
    ready,
    writable,
    hasSandboxBreach,
    graph,
    step,
    factScene,
    scenes,
    checklist,
    result,
    document,
  ]);

  // A newly modeled branch is a possible response, not an event in the example.
  const [promoted, setPromoted] = useState<{
    document: DomainModelDocument;
    parent: string;
    focus: typeof canvasFocus;
    entityIds: string[];
    relationshipIds: string[];
  }>();
  const parent = step && stepRef(step);
  const promoteBreachOutcome = async (
    input: RecordBreachOutcomeInput,
  ): Promise<void> => {
    if (
      !onRecordBreachOutcome ||
      !parent ||
      !step ||
      step.inherited ||
      currentSandboxKey.current !== sandboxKey ||
      !promotionRequests.some(({ id }) => id === input.requestRef)
    )
      throw new Error('当前步骤或推演结果已变化，请重新核对。');
    setIsPlaying(false);
    const after = onRecordBreachOutcome(
      { ...input, forkSource: { storyId: step.storyId, stepId: step.stepId } },
      document,
    );
    if (flow) setPosition({ flowId: flow.flowId, ref: parent, index });
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
    const destination =
      step &&
      forksByStep
        ?.get(step.sequence)
        ?.find((fork) => fork.step.entityId === entity.id);
    return { entity, ...destination };
  }, [enabled, promoted, parent, document, stale, graph, forksByStep, step]);
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
    activeFlowId,
    currentStepSequence: step?.sequence ?? 0,
    snapshotId: ready ? loaded?.result.snapshotId : undefined,
    speed,
    setSpeed,
    step,
    scene,
    checklist,
    scenes,
    forksByStep,
    forkedFrom: flow?.forkedFrom,
    promotedBranch,
    canvasFocus:
      showPromotedFocus && displayFocus
        ? {
            ...displayFocus,
            relatedEntityIds: [
              ...displayFocus.relatedEntityIds,
              ...promoted.entityIds,
            ],
            candidateRelationshipIds: promoted.relationshipIds,
          }
        : canvasFocus,
    journeyPreview,
    projection,
    loading,
    error,
    stale,
    ready,
    skipAi,
    narration,
    isPlaying: ready && isPlaying,
    stepCount: flow?.steps.length ?? 0,
    stepNumber: step ? index + 1 : 0,
    canPrevious: ready && previousIndex >= 0,
    canNext,
    canPlay: ready && !nextBlocked && flow.steps.length > 1,
    selectFlow: (flowId: string, atStep?: FlowStepTrace) => {
      setIsPlaying(false);
      const start =
        atStep ??
        flows
          .find((flow) => flow.flowId === flowId)
          ?.steps.find((step) => !step.inherited);
      setPosition({ flowId, ref: start && stepRef(start), index: 0 });
      setPreferredFlowId(flowId);
    },
    openAtEntityExample,
    previous: () => {
      if (ready && previousIndex >= 0) {
        setIsPlaying(false);
        moveTo(previousIndex);
      }
    },
    next: () => {
      if (canNext) {
        setIsPlaying(false);
        moveTo(nextIndex);
      }
    },
    togglePlaying: () => {
      if (!ready || nextBlocked || flow.steps.length < 2) return;
      if (!isPlaying && nextStep === undefined) moveTo(0);
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
    resetSceneTrial: clearWhatIf,
    promoteBreachOutcome,
  };
};

export type StoryPlaybackController = ReturnType<typeof useStoryPlayback>;
