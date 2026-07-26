import { describe, expect, it } from 'vitest';
import { localCommandEnvironment } from './local-command-environment';

describe('localCommandEnvironment', () => {
  it('keeps operating-system plumbing and removes credentials', () => {
    const environment = localCommandEnvironment({
      PATH: '/usr/bin',
      HOME: '/home/developer',
      LANG: 'en_US.UTF-8',
      EVIDENCE_API_AUTHORIZATION: 'Bearer secret',
      ANTHROPIC_API_KEY: 'model-secret',
      GITHUB_TOKEN: 'github-secret',
      NODE_OPTIONS: '--require malicious.js',
    });

    expect(environment).toMatchObject({
      PATH: '/usr/bin',
      HOME: '/home/developer',
      LANG: 'en_US.UTF-8',
      CI: '1',
      GIT_TERMINAL_PROMPT: '0',
    });
    expect(environment).not.toHaveProperty('EVIDENCE_API_AUTHORIZATION');
    expect(environment).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(environment).not.toHaveProperty('GITHUB_TOKEN');
    expect(environment).not.toHaveProperty('NODE_OPTIONS');
  });
});
