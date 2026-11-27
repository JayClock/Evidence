import { useMemo } from 'react';
import { createDiagnosticIndex } from '@evidence-poc/desktop-feature-canvas';
import { useSensorsState } from '../../state/useSensorsState';
import { useArtifactStatus } from '../../state/useArtifactStatus';
import type { EditorSessionState } from '../../state/useEditorSession';

export const useEditorDiagnostics = (
  state: EditorSessionState,
  liveRevision: number,
) => {
  const { project } = state;
  const pendingPersistence = state.persistence.kind !== 'persisted';
  const manualSensors = useSensorsState(project.rootPath);
  const artifacts = useArtifactStatus(
    state.persistenceId,
    state.persistenceRevision,
    !pendingPersistence,
  );
  const syncStatus = artifacts?.delivery ?? null;
  const persistedSensors = artifacts?.sensors;
  const report =
    manualSensors.report?.documentRevision === liveRevision
      ? manualSensors.report
      : persistedSensors?.kind === 'checked'
        ? persistedSensors.report
        : null;
  const sensors = {
    report,
    refresh: manualSensors.refresh,
    loading: manualSensors.loading || persistedSensors?.kind === 'running',
    error:
      manualSensors.error ??
      (persistedSensors?.kind === 'failed' ? persistedSensors.error : null),
  };
  // Findings must describe the exact live revision, including undo/redo.
  const diagnosticsStale =
    report === null || sensors.loading || sensors.error !== null;
  const diagnostics = useMemo(
    () =>
      createDiagnosticIndex(
        diagnosticsStale ? null : sensors.report,
        state.document,
      ),
    [diagnosticsStale, sensors.report, state.document],
  );
  return { sensors, diagnostics, diagnosticsStale, syncStatus, artifacts };
};
