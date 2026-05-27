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

function assistantStructuredMessage(chunks: string[]): UIMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    parts: chunks.map((chunk) => ({
      type: 'data-structured',
      data: { kind: 'diagram-model', format: 'json', chunk },
    })),
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
  it('renders streamed partial JSON as a modeling proposal tool block', () => {
    render(
      <DiagramAssistantMessage
        message={assistantMessage(`{
          "summary": "Create a sales contract fulfillment model",
          "changes": {
            "addNodes": [
              {
                "id": "node-1",
                "data": {
                  "name": "SalesContract",
                  "label": "销售合同",
                  "type": "EVIDENCE",
                  "subType": "contract"
                }
              }
            ],
            "addEdges": [
              {
                "id": "edge-1",
                "source": { "id": "node-1" },
                "target": { "id": "node-2" },
                "relationType": "evidence_flow",
                "label": "creates"
              }
            ]`)}
      />,
    );

    expect(screen.getByText('Modeling proposal')).toBeTruthy();
    expect(
      screen.getByText('Create a sales contract fulfillment model'),
    ).toBeTruthy();
    expect(textContentIncludes('addNodes')).toBeTruthy();
    expect(textContentIncludes('addEdges')).toBeTruthy();
    expect(textContentIncludes('SalesContract')).toBeTruthy();
    expect(textContentIncludes('销售合同')).toBeTruthy();
    expect(textContentIncludes('EVIDENCE / contract')).toBeTruthy();
    expect(textContentIncludes('node-1 → node-2')).toBeTruthy();
    expect(textContentIncludes('evidence_flow')).toBeTruthy();
    expect(
      screen.getByText('AI output is advisory and has not been applied.'),
    ).toBeTruthy();
    expect(screen.getByText('proposal.json')).toBeTruthy();
  });

  it('renders structured JSON chunks as a proposal tool block after streaming', () => {
    render(
      <DiagramAssistantMessage
        message={assistantStructuredMessage([
          '{"summary":"Structured proposal","changes":{"addNodes":[',
          '{"id":"node-1","data":{"name":"SalesContract","label":"销售合同","type":"EVIDENCE","subType":"contract"}}',
          '],"updateNodes":[],"deleteNodes":[],"addEdges":[],"updateEdges":[],"deleteEdges":[]}}',
        ])}
      />,
    );

    expect(screen.getByText('Modeling proposal')).toBeTruthy();
    expect(screen.getByText('Structured proposal')).toBeTruthy();
    expect(textContentIncludes('SalesContract')).toBeTruthy();
    expect(screen.queryByText('data-structured.json')).toBeNull();
  });

  it('shows a lightweight status while structured JSON is streaming', () => {
    render(
      <DiagramAssistantMessage
        isStreaming
        message={assistantStructuredMessage([
          '{"summary":"Streaming structured proposal"',
        ])}
      />,
    );

    expect(screen.getByText('正在生成 proposal JSON…')).toBeTruthy();
    expect(screen.queryByText(/Streaming structured proposal/)).toBeNull();
    expect(screen.queryByText('data-structured.json')).toBeNull();
  });

  it('keeps proposal JSON as text while it is streaming', () => {
    render(
      <DiagramAssistantMessage
        isStreaming
        message={assistantMessage(`{
          "summary": "Streaming proposal",
          "changes": {
            "addNodes": [],
            "updateNodes": [],
            "deleteNodes": [],
            "addEdges": [],
            "updateEdges": [],
            "deleteEdges": []
          }
        }`)}
      />,
    );

    expect(screen.queryByText(/Modeling proposal/)).toBeNull();
    expect(textContentIncludes('Streaming proposal')).toBeTruthy();
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
