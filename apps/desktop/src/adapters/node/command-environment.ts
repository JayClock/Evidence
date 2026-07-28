const PASSTHROUGH_ENVIRONMENT_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
] as const;

/**
 * Repository commands receive only operating-system plumbing, never the
 * Desktop process's API or model credentials.
 */
export function localCommandEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    CI: '1',
    GIT_TERMINAL_PROMPT: '0',
    NO_COLOR: '1',
  };
  for (const key of PASSTHROUGH_ENVIRONMENT_KEYS) {
    if (source[key] !== undefined) environment[key] = source[key];
  }
  for (const [key, value] of Object.entries(source)) {
    if ((key === 'LANG' || key.startsWith('LC_')) && value !== undefined) {
      environment[key] = value;
    }
  }
  return environment;
}
