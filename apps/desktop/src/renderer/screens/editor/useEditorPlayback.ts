import { useCallback, useMemo } from 'react';
import { recordBreachOutcomeMutator } from '@evidence-poc/evidence-model-core';
import { isFulfillmentRequest } from '@evidence-poc/evidence-schema';
import { useStoryPlayback } from '@evidence-poc/desktop-feature-story';
import type { EditorSessionState } from '../../state/useEditorSession';
import type { EditorSurfaces } from './useEditorSurfaces';
import type { EditorModeling } from './useEditorModeling';

export const useEditorPlayback = (
  state: EditorSessionState,
  surfaces: EditorSurfaces,
  modeling: EditorModeling,
) => {
  const { project } = state;
  const { ai, agent, patchReview } = modeling;
  const { record: recordPatch } = patchReview;
  const { ledgerActive, storyActive, setStoryEntry } = surfaces;
  const externalConflict = state.persistence.kind === 'conflict';
  const canPlayStory = useMemo(
    () =>
      state.document.entities.some(
        (entity) =>
          isFulfillmentRequest(entity) ||
          entity.examples?.some((example) => Boolean(example.test?.flow)),
      ),
    [state.document],
  );
  const story = useStoryPlayback({
    api: window.evidenceAPI.story,
    rootPath: project.rootPath,
    document: state.document,
    enabled: storyActive,
    aiConfigured: ai?.aiConfigured,
    onRecordBreachOutcome:
      agent.running || patchReview.review || externalConflict
        ? undefined
        : (input, before) => {
            if (state.session.getDocument() !== before)
              throw new Error('模型已变化，请重新推演后再提交。');
            const rationale = `${input.outcome.kind === 'compensation_pair' ? '约定履约补救' : '启动终极救济'} · ${input.condition}`;
            state.session.mutate(
              (draft) => recordBreachOutcomeMutator(draft, input),
              rationale,
            );
            const after = state.session.getDocument();
            recordPatch({
              source: 'story',
              rationale,
              commands: ['record_breach_outcome'],
              before,
              after,
              focusNodeId: input.requestRef,
            });
            return after;
          },
  });
  const { openAtEntityExample } = story;
  const openStory = useCallback(() => {
    if (ledgerActive || !canPlayStory) return;
    if (state.selection.nodeId) openAtEntityExample(state.selection.nodeId);
    setStoryEntry('script');
  }, [ledgerActive, canPlayStory, state.selection.nodeId, openAtEntityExample]);
  return { story, openStory, canPlayStory };
};

export type EditorPlayback = ReturnType<typeof useEditorPlayback>;
