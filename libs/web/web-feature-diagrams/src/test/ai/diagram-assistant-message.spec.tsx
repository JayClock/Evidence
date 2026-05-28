import { render, screen } from '@testing-library/react';
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

function assistantProposalToolMessage(proposal: unknown): UIMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      {
        type: 'dynamic-tool',
        toolCallId: 'submit-modeling-proposal-1',
        toolName: 'submit_modeling_proposal',
        state: 'output-available',
        input: proposal,
        output: { details: { proposal } },
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
  it('renders proposal tool output as a modeling proposal block after streaming', () => {
    render(
      <DiagramAssistantMessage
        message={assistantProposalToolMessage({
          summary: 'Structured proposal',
          changes: {
            addNodes: [
              {
                id: 'node-1',
                data: {
                  name: 'SalesContract',
                  label: '销售合同',
                  type: 'EVIDENCE',
                  subType: 'contract',
                },
              },
            ],
            updateNodes: [],
            deleteNodes: [],
            addEdges: [
              {
                id: 'edge-1',
                source: { id: 'node-1' },
                target: { id: 'node-2' },
                relationType: 'evidence_flow',
                label: 'creates',
              },
            ],
            updateEdges: [],
            deleteEdges: [],
          },
        })}
      />,
    );

    expect(screen.getByText('Modeling proposal')).toBeTruthy();
    expect(screen.getByText('Structured proposal')).toBeTruthy();
    expect(textContentIncludes('SalesContract')).toBeTruthy();
    expect(textContentIncludes('销售合同')).toBeTruthy();
    expect(textContentIncludes('EVIDENCE / contract')).toBeTruthy();
    expect(textContentIncludes('node-1 → node-2')).toBeTruthy();
    expect(textContentIncludes('evidence_flow')).toBeTruthy();
    expect(
      screen.getByText('AI output is advisory and has not been applied.'),
    ).toBeTruthy();
    expect(screen.getByText('proposal.json')).toBeTruthy();
    expect(screen.queryByText('dynamic-tool.json')).toBeNull();
  });

  it('renders proposal tool calls with standard tool input while streaming', () => {
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
                toolCallId: 'submit-modeling-proposal-1',
                toolName: 'submit_modeling_proposal',
                state: 'input-streaming',
                input: { summary: 'Streaming proposal' },
              },
            ],
          } as UIMessage
        }
      />,
    );

    expect(screen.getByText('submit_modeling_proposal')).toBeTruthy();
    expect(screen.getByText('Parameters')).toBeTruthy();
    expect(textContentIncludes('Streaming proposal')).toBeTruthy();
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
                toolCallId: 'submit-modeling-proposal-1',
                toolName: 'submit_modeling_proposal',
                state: 'input-streaming',
                input: undefined,
              },
            ],
          } as UIMessage
        }
      />,
    );

    expect(screen.getByText('submit_modeling_proposal')).toBeTruthy();
    expect(screen.queryByText('Parameters')).toBeNull();
  });

  it('renders ordinary assistant text as a message response', () => {
    render(
      <DiagramAssistantMessage
        message={assistantMessage('Just plain text.')}
      />,
    );

    expect(screen.getByText('Just plain text.')).toBeTruthy();
    expect(screen.queryByText(/Modeling proposal/)).toBeNull();
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
