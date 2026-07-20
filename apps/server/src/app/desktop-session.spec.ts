import { describe, expect, it } from 'vitest';
import { isValidDesktopSession } from './desktop-session';

describe('desktop session token', () => {
  it('does not affect hosted requests when no token is configured', () => {
    expect(isValidDesktopSession(undefined, undefined)).toBe(true);
    expect(isValidDesktopSession('anything', undefined)).toBe(true);
  });

  it('accepts only the configured token in desktop mode', () => {
    expect(isValidDesktopSession('secret', 'secret')).toBe(true);
    expect(isValidDesktopSession(undefined, 'secret')).toBe(false);
    expect(isValidDesktopSession('wrong', 'secret')).toBe(false);
    expect(isValidDesktopSession('secret-longer', 'secret')).toBe(false);
  });
});
