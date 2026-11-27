import { useCallback, useEffect, useState } from 'react';

import type { SensorReport } from '@evidence-poc/evidence-agent-sensors/browser';

export interface SensorsState {
  report: SensorReport | null;
  loading: boolean;
  error: string | null;
}

export interface SensorsController extends SensorsState {
  /** Explicit diagnostics for the current canvas, not a disk export. */
  refresh: () => Promise<void>;
}

/**
 * Reads the sensor verdict the main process publishes.
 *
 * Automatic checks come from the disk artifact pipeline; this hook only
 * consumes explicit canvas or agent checks.
 */
export const useSensorsState = (rootPath: string): SensorsController => {
  const [state, setState] = useState<SensorsState>({
    report: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));

    try {
      const report = await window.evidenceAPI.agent.triggerSensors({
        rootPath,
      });

      setState({ report, loading: false, error: null });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : '无法运行检查器。',
      }));
    }
  }, [rootPath]);

  useEffect(() => {
    let active = true;
    let seen = false;

    const unsubscribe = window.evidenceAPI.agent.onReport((payload) => {
      if (active && payload.rootPath === rootPath) {
        seen = true;
        setState({ report: payload.report, loading: false, error: null });
      }
    });

    void window.evidenceAPI.agent
      .latestReport({ rootPath })
      .then((report) => {
        if (active && !seen && report !== null)
          setState({ report, loading: false, error: null });
      })
      .catch(() => undefined);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [rootPath]);

  return { ...state, refresh };
};
