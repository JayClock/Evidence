import { useCallback } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ExternalStoreAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { Button } from '@evidence-poc/desktop-ui-kit';
import { Thread } from '@evidence-poc/desktop-ui-chat';
import type { PatchReviewController } from '../../state/usePatchReview';
import type { PiConversation } from '../../state/usePiConversation';
import { InlinePatchCard } from './InlinePatchCard';

const convertMessage = (message: ThreadMessageLike) => message;
const threadComponents = { Welcome: () => null };

/** The official Thread owns chat rendering; Evidence supplies scope and actions. */
export const EvidenceAgentThread = ({
  nodeId,
  canExploreVariation = false,
  conversation,
  patchReview,
  onFocusEntity,
  aiConfigured = true,
  onConfigureAi,
}: {
  nodeId: string;
  canExploreVariation?: boolean;
  conversation: PiConversation;
  patchReview: PatchReviewController;
  onFocusEntity: (id: string) => void;
  aiConfigured?: boolean;
  onConfigureAi?: () => void;
}) => {
  const { messages, running, submit, stop, stopError } = conversation;
  const { review } = patchReview;
  const hasReview = review !== null;
  const onNew: ExternalStoreAdapter<ThreadMessageLike>['onNew'] = useCallback(
    async ({ content }) => {
      if (!aiConfigured || hasReview) return;
      const text = content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('');
      await submit(text, { nodeId, inquiry: 'trace' });
    },
    [aiConfigured, hasReview, nodeId, submit],
  );
  const runtime = useExternalStoreRuntime({
    messages,
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
          <p>请先配置大模型，再澄清这张凭证的权责。</p>
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
      {aiConfigured && canExploreVariation && (
        <div className="shrink-0 px-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={running || hasReview}
            onClick={() => {
              void submit(
                '请帮我识别这项履约是否存在真实的跨合同协作或可替换的确认方式。先问一个问题，不创建角色或修改模型。',
                { nodeId, inquiry: 'trace' },
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
          <Thread components={threadComponents} />
        </AssistantRuntimeProvider>
      )}
      {review?.focusNodeId === nodeId && (
        <div className="max-h-[40%] shrink-0 overflow-y-auto px-3 pb-2">
          <InlinePatchCard
            review={review}
            onAccept={patchReview.accept}
            onRevert={patchReview.revert}
            onFocusEntity={onFocusEntity}
            busy={running}
            enterToAccept
          />
        </div>
      )}
    </div>
  );
};
