const TRUSTED_RENDERER_PROTOCOLS = new Set(['evidence:', 'http:', 'https:']);

export function isTrustedRendererRequest(options: {
  senderUrl: string | undefined;
  expectedUrl: string;
  isMainFrame: boolean;
}): boolean {
  if (!options.isMainFrame || !options.senderUrl) {
    return false;
  }

  try {
    const sender = new URL(options.senderUrl);
    const expected = new URL(options.expectedUrl);
    return (
      TRUSTED_RENDERER_PROTOCOLS.has(expected.protocol) &&
      sender.protocol === expected.protocol &&
      sender.host === expected.host &&
      sender.username === '' &&
      sender.password === '' &&
      expected.username === '' &&
      expected.password === ''
    );
  } catch {
    return false;
  }
}
