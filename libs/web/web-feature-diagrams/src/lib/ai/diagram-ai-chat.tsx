import { useCallback, useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import type { ChatOnFinishCallback, UIMessage } from 'ai';
import type { DiagramResource, State } from '@evidence/api-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@evidence/ui';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@evidence/ui/ai-elements/conversation';
import { Message, MessageContent } from '@evidence/ui/ai-elements/message';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@evidence/ui/ai-elements/prompt-input';

import { DiagramAssistantMessage } from './diagram-assistant-message';
import {
  createDiagramProposalTransport,
  resolveProposeModelUrl,
} from './diagram-proposal-transport';

type DiagramAiChatProps = {
  onModelUpdated?: () => Promise<void> | void;
  resourceState: State<DiagramResource>;
};

export function DiagramAiChat({
  onModelUpdated,
  resourceState,
}: DiagramAiChatProps) {
  const [input, setInput] = useState('');
  const proposeModelUrl = resolveProposeModelUrl(resourceState);
  const transport = useMemo(
    () => createDiagramProposalTransport(resourceState),
    [resourceState],
  );
  const handleModelingFinished = useCallback<ChatOnFinishCallback<UIMessage>>(
    ({ isAbort, isDisconnect, isError }) => {
      if (!onModelUpdated || isAbort || isDisconnect || isError) {
        return;
      }

      void Promise.resolve(onModelUpdated()).catch((error: unknown) => {
        console.error('Diagram model refresh failed', error);
      });
    },
    [onModelUpdated],
  );
  const { error, messages, sendMessage, status } = useChat({
    onFinish: handleModelingFinished,
    transport,
  });
  const isStreaming = status === 'streaming';
  const disabled =
    !proposeModelUrl || status === 'submitted' || status === 'streaming';

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (!text || disabled) {
      return;
    }

    void sendMessage({ text });
    setInput('');
  };

  return (
    <Card
      aria-label="AI modeling assistant"
      role="region"
      className="flex flex-col min-w-0"
    >
      <CardHeader>
        <CardDescription>Diagram AI</CardDescription>
        <CardTitle>AI modeling assistant</CardTitle>
        <CardDescription>
          Ask for changes to the local .evidence model. The canvas refreshes
          after the assistant finishes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 min-h-0 flex-col gap-3">
        <Conversation className="min-h-0 rounded-lg border bg-muted/20">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="Ask for a fulfillment model"
                description="Describe the business requirement to stream an AI modeling proposal."
              />
            ) : (
              messages.map((message, index) => (
                <DiagramAssistantMessage
                  isStreaming={isStreaming && index === messages.length - 1}
                  key={message.id}
                  message={message}
                />
              ))
            )}
            {error ? (
              <Message from="assistant">
                <MessageContent className="text-destructive">
                  <p>AI modeling failed: {error.message}</p>
                </MessageContent>
              </Message>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              aria-label="AI modeling requirement"
              disabled={disabled}
              onChange={(event) => {
                setInput((event.target as unknown as { value: string }).value);
              }}
              placeholder="Describe the fulfillment model to propose…"
              value={input}
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit
              disabled={disabled || input.trim().length === 0}
              status={status}
            />
          </PromptInputFooter>
        </PromptInput>
      </CardContent>
    </Card>
  );
}
