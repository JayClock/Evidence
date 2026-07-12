import { describe, expect, it } from 'vitest';
import evidenceWorkflowExtension from './index';

describe('index', () => {
  it('registers lifecycle handlers, commands, and tools', () => {
    const events: string[] = [];
    const commands: string[] = [];
    const tools: string[] = [];
    evidenceWorkflowExtension({
      on(name: string) {
        events.push(name);
      },
      registerCommand(name: string) {
        commands.push(name);
      },
      registerTool(definition: { name: string }) {
        tools.push(definition.name);
      },
    } as never);

    expect(events).toEqual(
      expect.arrayContaining(['session_start', 'session_shutdown']),
    );
    expect(commands).toContain('evidence-run');
    expect(tools).toContain('evidence_workflow_status');
  });
});
