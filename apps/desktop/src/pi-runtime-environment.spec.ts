import { describe, expect, it } from 'vitest';
import { piRuntimeEnvironment } from './pi-runtime-environment';

describe('piRuntimeEnvironment', () => {
  it('passes only provider configuration and explicitly allowed custom keys', () => {
    const environment = piRuntimeEnvironment({
      OPENAI_API_KEY: 'provider-secret',
      PI_CODING_AGENT_DIR: '/isolated/pi-agent',
      EVIDENCE_PI_ENV_ALLOWLIST: 'CUSTOM_MODEL_TOKEN, INVALID-KEY',
      CUSTOM_MODEL_TOKEN: 'custom-secret',
      DATABASE_URL: 'postgresql://database-secret',
      EVIDENCE_API_AUTHORIZATION: 'Bearer server-secret',
      UNRELATED_SECRET: 'must-not-pass',
    });

    expect(environment).toEqual({
      OPENAI_API_KEY: 'provider-secret',
      PI_CODING_AGENT_DIR: '/isolated/pi-agent',
      CUSTOM_MODEL_TOKEN: 'custom-secret',
    });
  });
});
