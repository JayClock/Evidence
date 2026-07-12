import { describe, expect, it } from 'vitest';
import { registerCommands } from './commands';

describe('commands', () => {
  it('registers workflow, gate, and explicit TQA-answer commands', () => {
    const commands: string[] = [];
    registerCommands({
      registerCommand(name: string) {
        commands.push(name);
      },
    } as never);

    expect(commands).toEqual(
      expect.arrayContaining([
        'evidence-run',
        'evidence-reset',
        'evidence-gate',
        'evidence-answer',
      ]),
    );
  });
});
