import { timingSafeEqual } from 'node:crypto';

export const DESKTOP_SESSION_HEADER = 'x-evidence-desktop-token';

export function isValidDesktopSession(
  providedToken: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) {
    return true;
  }
  if (!providedToken) {
    return false;
  }

  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
