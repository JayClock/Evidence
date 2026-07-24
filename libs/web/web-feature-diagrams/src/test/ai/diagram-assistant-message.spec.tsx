import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';

import { DiagramAssistantMessage } from '../../lib/ai/diagram-assistant-message';

function assistantMessage(text: string): UIMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    parts: [{ type: 'text', text }],
  };
}

function assistantToolMessage(
  toolName: string,
  input: unknown,
  output: unknown,
): UIMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      {
        type: 'dynamic-tool',
        toolCallId: 'modeling-tool-1',
        toolName,
        state: 'output-available',
        input,
        output,
      },
    ],
  } as UIMessage;
}

function textContentIncludes(text: string): boolean {
  return (
    screen.queryAllByText((_content, element) => {
      const textContent = (element as { textContent?: string } | null)
        ?.textContent;
      return Boolean(textContent?.includes(text));
    }).length > 0
  );
}

describe('DiagramAssistantMessage', () => {
  it('renders completed local modeling tools with their input and result', () => {
    render(
      <DiagramAssistantMessage
        message={assistantToolMessage(
          'evidence_create_logical_entity',
          { name: 'SalesContract', type: 'EVIDENCE' },
          { id: 'entity-1', name: 'SalesContract', type: 'EVIDENCE' },
        )}
      />,
    );

    expect(screen.getByText('evidence_create_logical_entity')).toBeTruthy();
    expect(screen.getByText('Parameters')).toBeTruthy();
    expect(screen.getByText('Result')).toBeTruthy();
    expect(textContentIncludes('SalesContract')).toBeTruthy();
    expect(textContentIncludes('entity-1')).toBeTruthy();
  });

  it('renders local modeling tool calls with standard input while streaming', () => {
    render(
      <DiagramAssistantMessage
        isStreaming
        message={
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [
              {
                type: 'dynamic-tool',
                toolCallId: 'modeling-tool-1',
                toolName: 'evidence_create_logical_entity',
                state: 'input-streaming',
                input: { name: 'Streaming entity' },
              },
            ],
          } as UIMessage
        }
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /evidence_create_logical_entity/,
      }),
    );
    expect(screen.getByText('Parameters')).toBeTruthy();
    expect(textContentIncludes('Streaming entity')).toBeTruthy();
  });

  it('does not render tool input before streaming parameters are available', () => {
    render(
      <DiagramAssistantMessage
        isStreaming
        message={
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [
              {
                type: 'dynamic-tool',
                toolCallId: 'modeling-tool-1',
                toolName: 'evidence_create_logical_entity',
                state: 'input-streaming',
                input: undefined,
              },
            ],
          } as UIMessage
        }
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /evidence_create_logical_entity/,
      }),
    );
    expect(screen.queryByText('Parameters')).toBeNull();
  });

  it('renders ordinary assistant text as a message response', () => {
    render(
      <DiagramAssistantMessage
        message={assistantMessage('Just plain text.')}
      />,
    );

    expect(screen.getByText('Just plain text.')).toBeTruthy();
  });

  it('renders reasoning parts with the AI Elements reasoning block', () => {
    render(
      <DiagramAssistantMessage
        isStreaming
        message={
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [
              { type: 'reasoning', text: 'Thinking through the diagram.' },
              { type: 'text', text: 'Use a contract evidence node.' },
            ],
          } as UIMessage
        }
      />,
    );

    expect(screen.getByText('Thinking...')).toBeTruthy();
    expect(screen.getByText('Thinking through the diagram.')).toBeTruthy();
    expect(screen.getByText('Use a contract evidence node.')).toBeTruthy();
  });

  it('renders custom data parts as JSON code blocks', () => {
    render(
      <DiagramAssistantMessage
        message={
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [
              {
                type: 'data-diagnostic',
                data: { status: 'ok', count: 2 },
              },
            ],
          } as UIMessage
        }
      />,
    );

    expect(screen.getByText('data-diagnostic.json')).toBeTruthy();
    expect(screen.getByText(/status/)).toBeTruthy();
    expect(screen.getByText(/ok/)).toBeTruthy();
  });
});
