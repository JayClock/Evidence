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

function assistantMessageWithFinalProposal(
  text: string,
  proposal: unknown,
): UIMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      { type: 'text', text },
      { type: 'data-proposal', data: proposal },
    ],
  } as UIMessage;
}

describe('DiagramAssistantMessage', () => {
  it('renders streamed partial JSON as a modeling proposal card', () => {
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
    expect(screen.getByText('addNodes')).toBeTruthy();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByText('addEdges')).toBeTruthy();
    expect(screen.getByText('SalesContract')).toBeTruthy();
    expect(screen.getByText('销售合同')).toBeTruthy();
    expect(screen.getByText('EVIDENCE / contract')).toBeTruthy();
    expect(screen.getByText('node-1 → node-2')).toBeTruthy();
    expect(screen.getByText('evidence_flow')).toBeTruthy();
    expect(
      screen.getByText('AI output is advisory and has not been applied.'),
    ).toBeTruthy();
    expect(screen.getByText('Raw JSON')).toBeTruthy();
  });

  it('shows a parsing fallback while streamed text is not yet proposal-shaped', () => {
    render(
      <DiagramAssistantMessage message={assistantMessage('{ "summary"')} />,
    );

    expect(screen.getByText('Parsing streamed JSON…')).toBeTruthy();
    expect(screen.getByText('{ "summary"')).toBeTruthy();
  });

  it('prefers the final proposal data part over streamed text', () => {
    render(
      <DiagramAssistantMessage
        message={assistantMessageWithFinalProposal(
          '{ "summary": "Streaming" }',
          {
            summary: 'Final backend proposal',
            changes: {
              addNodes: [],
              updateNodes: [],
              deleteNodes: [],
              addEdges: [],
              updateEdges: [],
              deleteEdges: [],
            },
          },
        )}
      />,
    );

    expect(screen.getByText('Final backend proposal')).toBeTruthy();
    expect(screen.queryByText('Streaming')).toBeNull();
    expect(screen.getByText('Final')).toBeTruthy();
  });
});
