import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isEvidenceEntity,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import {
  type AppliedPatch,
  usePiConversation,
  usePatchReview,
} from '@evidence-poc/desktop-feature-agent';
import { useLiveModelBridge } from '../../state/useLiveModelBridge';
import { useAiConfiguration } from '../../state/AiConfiguration';
import type { EditorSessionState } from '../../state/useEditorSession';
import type { EditorSurfaces } from './useEditorSurfaces';
import type { CanvasNavigation } from './useCanvasNavigation';

export const useEditorModeling = (
  state: EditorSessionState,
  initialDocument: DomainModelDocument,
  surfaces: EditorSurfaces,
  scope: CanvasNavigation['scope'],
) => {
  const { project } = state;
  const {
    workspaceView,
    storyActive,
    ledgerActive,
    closeStory,
    returnToCanvas,
    setSelectedScope,
    setOverviewOpen,
  } = surfaces;
  const ai = useAiConfiguration();
  const [inquiry, setInquiry] = useState<string | null>(null);
  const [stormingOpen, setStormingOpen] = useState(false);
  const [stormingFocus, setStormingFocus] = useState(0);
  const [stormingBusy, setStormingBusy] = useState(false);
  const [stormingError, setStormingError] = useState<string | null>(null);
  const [stormingFrame, setStormingFrame] = useState<readonly string[] | null>(
    null,
  );
  const stormingReturnFocus = useRef<HTMLElement | null>(null);
  const stormingAdded = useRef<Set<string> | null>(null);
  const patchReview = usePatchReview(state.session, state.document);
  const { record: recordPatch } = patchReview;
  const recordAgentPatch = useCallback(
    (patch: AppliedPatch) => {
      recordPatch(patch);
      const added = stormingAdded.current;
      if (added === null) return;
      const before = new Set(patch.before.entities.map(({ id }) => id));
      for (const entity of patch.after.entities) {
        if (!before.has(entity.id) && isEvidenceEntity(entity))
          added.add(entity.id);
      }
    },
    [recordPatch],
  );
  const liveModel = useLiveModelBridge(
    project.rootPath,
    state.session,
    initialDocument,
    recordAgentPatch,
  );
  const agent = usePiConversation(
    window.evidenceAPI.agent,
    project.rootPath,
    liveModel.prompt,
  );
  const startStorming = useCallback(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      !active.closest('[data-canvas-storming]')
    ) {
      stormingReturnFocus.current = active;
    }
    setInquiry(null);
    setOverviewOpen(false);
    closeStory();
    workspaceView.returnToGraph();
    setStormingOpen(true);
    setStormingFocus((token) => token + 1);
  }, [closeStory, workspaceView.returnToGraph]);

  const closeStorming = useCallback(() => {
    setStormingOpen(false);
    const previous = stormingReturnFocus.current;
    stormingReturnFocus.current = null;
    if (
      previous?.isConnected &&
      previous !== document.body &&
      !previous.closest('[inert], [hidden]')
    ) {
      previous.focus({ preventScroll: true });
    } else {
      returnToCanvas();
    }
  }, [returnToCanvas]);

  const submitStorming = async (text: string): Promise<boolean> => {
    if (
      agent.running ||
      stormingAdded.current !== null ||
      patchReview.review !== null ||
      ai?.aiConfigured === false
    )
      return false;
    const added = new Set<string>();
    stormingAdded.current = added;
    setStormingOpen(true);
    setStormingBusy(true);
    setStormingError(null);
    setSelectedScope(null);
    closeStory();
    workspaceView.returnToGraph();
    const result = await agent.submit(
      '请从以下业务场景提取有依据的业务记录，按邀请投标、投标、签约、履约归类，使用 batch_add_evidence_stubs 批量铺设凭证。只写业务事实，不记录资料出处和摘录；未知留空，不强行补齐阶段。\n\n业务场景：\n' +
        text,
      { nodeId: null },
    );
    stormingAdded.current = null;
    setStormingBusy(false);
    const frame = state.session
      .getDocument()
      .entities.filter(({ id }) => added.has(id))
      .map(({ id }) => id);
    if (frame.length === 0) {
      setStormingError(
        result.success
          ? '未生成新凭证，请补充可识别的业务记录后再试。'
          : result.error,
      );
      return false;
    }
    setStormingFrame(frame);
    if (
      document.activeElement === document.body ||
      document.activeElement?.closest('[data-canvas-storming]')
    ) {
      closeStorming();
    } else {
      setStormingOpen(false);
    }
    return true;
  };

  const inquiryTarget =
    !storyActive &&
    !ledgerActive &&
    inquiry !== null &&
    state.selection.nodeId === inquiry &&
    isEvidenceEntity(state.graph.getEntity(inquiry)) &&
    (scope === null || scope.nodeIds.has(inquiry))
      ? inquiry
      : null;
  const reviewInInquiry =
    inquiryTarget !== null && patchReview.review?.focusNodeId === inquiryTarget;
  const canKeepPatch = patchReview.review !== null && !agent.running;
  const canRevertPatch =
    canKeepPatch && patchReview.review?.revertable === true;
  useEffect(() => {
    if (inquiry !== null && inquiryTarget === null) setInquiry(null);
  }, [inquiry, inquiryTarget]);

  const closeInquiry = useCallback((nodeId: string) => {
    setInquiry((current) => (current === nodeId ? null : current));
  }, []);

  const openInquiry = (
    nodeId: string,
    question = '请先读这张凭证，按它所在的业务阶段，问我一个最关键的澄清问题：这张凭证回应了什么、谁向谁主张什么、交付什么或什么算完成？不要重复问已知信息，本轮只提问，不修改模型。',
    readOnly = false,
  ) => {
    if (agent.running || patchReview.review !== null) return;
    if (!isEvidenceEntity(state.graph.getEntity(nodeId))) return;
    state.session.select(nodeId);
    setStormingOpen(false);
    setInquiry(nodeId);
    agent.reset();
    if (ai?.aiConfigured === false) return;
    void agent.submit(question, {
      nodeId,
      inquiry: 'trace',
      ...(readOnly && { readOnly: true }),
    });
  };

  const clearStormingFrame = useCallback(() => setStormingFrame(null), []);

  useEffect(() => {
    const entity =
      state.selection.nodeId === null
        ? undefined
        : state.graph.getEntity(state.selection.nodeId);

    void window.evidenceAPI.agent.publishCanvasContext({
      rootPath: project.rootPath,
      context: {
        projectRoot: project.rootPath,
        modelId: state.document.manifest.id,
        selection: state.selection,
        ...(entity === undefined
          ? {}
          : {
              selected: {
                nodeId: entity.id,
                label: entity.label,
                kind: entity.category,
                ...('contextRef' in entity && entity.contextRef !== undefined
                  ? { contextRef: entity.contextRef }
                  : {}),
              },
            }),
      },
    });
  }, [
    project.rootPath,
    state.selection,
    state.graph,
    state.document.manifest.id,
  ]);
  return {
    ai,
    agent,
    liveModel,
    patchReview,
    startStorming,
    closeStorming,
    submitStorming,
    stormingOpen,
    stormingFocus,
    stormingBusy,
    stormingError,
    stormingFrame,
    clearStormingFrame,
    inquiryTarget,
    reviewInInquiry,
    openInquiry,
    closeInquiry,
    canKeepPatch,
    canRevertPatch,
  };
};

export type EditorModeling = ReturnType<typeof useEditorModeling>;
