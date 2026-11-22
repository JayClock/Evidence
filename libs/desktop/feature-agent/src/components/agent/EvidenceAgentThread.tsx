import { createContext, useCallback, useContext, useMemo } from 'react';
import {
  AssistantRuntimeProvider,
  makeAssistantDataUI,
  useExternalStoreRuntime,
  type ExternalStoreAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import type { AgentInquiryKind } from '@evidence-poc/desktop-contracts/agentIpc';
import { Button } from '@evidence-poc/desktop-ui-kit';
import { Thread } from '../../assistant-ui/elements/thread.aui';
import type { PatchReviewController } from '../../state/usePatchReview';
import type { PiConversation } from '../../state/usePiConversation';
import { InlinePatchCard } from './InlinePatchCard';

const reviewPart = { type: 'data-evidence-patch-review', data: null } as const;
const ReviewContext = createContext<{
  patch: PatchReviewController;
  onFocusEntity: (id: string) => void;
} | null>(null);

const PendingPatch = () => {
  const data = useContext(ReviewContext);
  if (!data?.patch.review) return null;
  return (
    <InlinePatchCard
      review={data.patch.review}
      onAccept={data.patch.accept}
      onRevert={data.patch.revert}
      onFocusEntity={data.onFocusEntity}
      enterToAccept
    />
  );
};

// The host transaction, not a tool's result, is the source of truth.
const PatchReviewDataUI = makeAssistantDataUI({
  name: 'evidence-patch-review',
  render: PendingPatch,
});

const convertMessage = (message: ThreadMessageLike) => message;
const threadComponents = { Welcome: () => null };

/** The official Thread owns chat rendering; Evidence supplies scope and actions. */
export const EvidenceAgentThread = ({
  nodeId,
  inquiry,
  canExploreVariation = false,
  conversation,
  patchReview,
  onFocusEntity,
  aiConfigured = true,
  onConfigureAi,
}: {
  nodeId: string;
  inquiry: AgentInquiryKind;
  canExploreVariation?: boolean;
  conversation: PiConversation;
  patchReview: PatchReviewController;
  onFocusEntity: (id: string) => void;
  aiConfigured?: boolean;
  onConfigureAi?: () => void;
}) => {
  const { messages, running, submit, stop, stopError } = conversation;
  const hasReview = patchReview.review !== null;
  const visibleMessages = useMemo(() => {
    const tail = messages.at(-1);
    if (
      !hasReview ||
      tail?.role !== 'assistant' ||
      typeof tail.content === 'string'
    )
      return messages;
    return [
      ...messages.slice(0, -1),
      { ...tail, content: [...tail.content, reviewPart] },
    ];
  }, [hasReview, messages]);
  const onNew: ExternalStoreAdapter<ThreadMessageLike>['onNew'] = useCallback(
    async ({ content }) => {
      if (!aiConfigured || hasReview) return;
      const text = content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('');
      await submit(text, { nodeId, inquiry });
    },
    [aiConfigured, hasReview, inquiry, nodeId, submit],
  );
  const runtime = useExternalStoreRuntime({
    messages: visibleMessages,
    convertMessage,
    isRunning: running,
    isDisabled: !aiConfigured,
    isSendDisabled: hasReview,
    onNew,
    onCancel: stop,
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-evidence-agent-thread="">
      {!aiConfigured && (
        <div className="flex shrink-0 flex-col items-start gap-2 p-3 text-xs">
          <p>请先配置大模型，再澄清权责或推演异常。</p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onConfigureAi}
          >
            配置 Pi 模型
          </Button>
        </div>
      )}
      {aiConfigured && inquiry === 'trace' && canExploreVariation && (
        <div className="shrink-0 px-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={running || hasReview}
            onClick={() => {
              void submit(
                '请帮我识别这项履约是否存在真实的跨合同协作或可替换的确认方式。先问一个问题，不创建角色或修改模型。',
                { nodeId, inquiry },
              );
            }}
          >
            识别变化点
          </Button>
        </div>
      )}
      {stopError && (
        <p role="alert" className="px-3 text-sm">
          {stopError}
        </p>
      )}
      {(aiConfigured || messages.length > 0) && (
        <AssistantRuntimeProvider runtime={runtime}>
          <ReviewContext.Provider value={{ patch: patchReview, onFocusEntity }}>
            <PatchReviewDataUI />
            <Thread components={threadComponents} />
          </ReviewContext.Provider>
        </AssistantRuntimeProvider>
      )}
    </div>
  );
};
