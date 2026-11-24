import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createModelSession,
  type DomainGraph,
  type ModelSelection,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';
import {
  compactCanonicalJson,
  type DomainModelDocument,
  type ValidationResult,
} from '@evidence-poc/evidence-schema';
import type {
  CanvasViewMode,
  DomainGraphLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import type {
  EvidenceProjectSummary,
  PersistenceResult,
  PersistenceState,
} from '@evidence-poc/desktop-contracts/projects';
import { useGraphLayout } from './useGraphLayout';

export interface EditorSessionState {
  project: EvidenceProjectSummary;
  rootPath: string;
  session: ModelSession;
  document: DomainModelDocument;
  graph: DomainGraph;
  layout: DomainGraphLayout;
  layoutError: string | null;
  selection: ModelSelection;
  canUndo: boolean;
  canRedo: boolean;
  validation: ValidationResult;
  persistence: PersistenceState;
  persistenceId: string | undefined;
  persistenceRevision: number;
  reloadError: string | null;
}

export interface EditorSessionController {
  state: EditorSessionState;
  flush: () => Promise<void>;
  reloadFromDisk: () => Promise<void>;
}

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/** The session is optimistic UI state. Main owns both the debounce and disk acknowledgement. */
export const useEditorSession = (
  project: EvidenceProjectSummary,
  initialDocument: DomainModelDocument,
  viewMode: CanvasViewMode = 'simplified',
  persistenceId?: string,
): EditorSessionController => {
  const [session] = useState(() =>
    createModelSession({ document: initialDocument }),
  );
  const [version, forceRender] = useState(0);
  const [status, setStatus] = useState<PersistenceState>({ kind: 'persisted' });
  const [reloadError, setReloadError] = useState<string | null>(null);
  const binding = useRef({ id: persistenceId, revision: 0 });
  const submission = useRef<Promise<PersistenceResult> | undefined>(undefined);
  const loading = useRef(false);
  const adopting = useRef(false);
  const lastEvent = useRef(0);
  const refreshStatus = useCallback(async (id: string | undefined) => {
    if (id === undefined) return;
    const before = lastEvent.current;
    const next = await window.evidenceAPI.projects
      .readPersistenceStatus(id)
      .catch(() => null);
    if (
      next &&
      lastEvent.current === before &&
      binding.current.id === id &&
      binding.current.revision === next.revision
    )
      setStatus(next);
  }, []);

  useLayoutEffect(() => {
    const api = window.evidenceAPI.projects;
    const offStatus = api.onPersistenceStatus((next) => {
      const { id, revision } = binding.current;
      if (next.persistenceId === id && next.revision === revision) {
        ++lastEvent.current;
        setStatus(next);
      }
    });
    void refreshStatus(binding.current.id);
    const offSession = session.subscribe((event) => {
      forceRender((value) => value + 1);
      if (event.type !== 'document-changed' || adopting.current) return;
      const current = binding.current;
      const id = current.id;
      if (id === undefined) return;
      const revision = ++current.revision;
      setStatus((previous) =>
        previous.kind === 'conflict' ? previous : { kind: 'queued' },
      );
      const failed = (error: string): PersistenceResult => {
        if (binding.current === current && revision === current.revision)
          setStatus({ kind: 'failed', error });
        return { success: false, error };
      };
      submission.current = api
        .enqueuePersistence({
          persistenceId: id,
          revision,
          document: session.getDocument(),
        })
        .then(
          (result) => (result.success ? result : failed(result.error)),
          (cause: unknown) => failed(errorMessage(cause)),
        );
    });
    return () => {
      offSession();
      offStatus();
    };
  }, [refreshStatus, session]);

  const flush = useCallback(async () => {
    const current = binding.current;
    if (current.id === undefined || loading.current) return;
    if (
      (await submission.current)?.success === false ||
      current !== binding.current
    )
      return;
    try {
      const result = await window.evidenceAPI.projects.flushPersistence(
        current.id,
      );
      if (!result.success && current === binding.current)
        setStatus((previous) =>
          previous.kind === 'conflict'
            ? previous
            : { kind: 'failed', error: result.error },
        );
    } catch (cause) {
      if (current === binding.current)
        setStatus({ kind: 'failed', error: errorMessage(cause) });
    }
  }, []);

  const reloadFromDisk = useCallback(async () => {
    if (loading.current || session.isDocumentLocked()) return;
    loading.current = true;
    const unlock = session.lockDocument();
    try {
      setReloadError(null);
      const result = await window.evidenceAPI.projects.open(
        project.rootPath,
        'discard-pending',
      );
      if (!result.success) {
        setReloadError(result.error);
        return;
      }
      binding.current = { id: result.persistenceId, revision: 0 };
      submission.current = undefined;
      adopting.current = true;
      unlock();
      if (
        compactCanonicalJson(result.document) !==
        compactCanonicalJson(session.getDocument())
      )
        session.replaceDocument(result.document, { resetHistory: true });
      setStatus({ kind: 'persisted' });
      void refreshStatus(result.persistenceId);
    } catch (cause) {
      setReloadError(errorMessage(cause));
    } finally {
      unlock();
      adopting.current = false;
      loading.current = false;
    }
  }, [project.rootPath, refreshStatus, session]);

  const snapshot = useMemo(() => {
    void version; // Refresh only for session events, not persistence notifications.
    return {
      project,
      rootPath: project.rootPath,
      session,
      document: session.getDocument(),
      graph: session.getGraph(),
      selection: session.getSelection(),
      canUndo: session.canUndo(),
      canRedo: session.canRedo(),
      validation: session.validate(),
    };
  }, [project, session, version]);
  const placement = useGraphLayout(snapshot.graph, viewMode);
  return {
    state: {
      ...snapshot,
      ...placement,
      persistence: status,
      persistenceId: binding.current.id,
      persistenceRevision: binding.current.revision,
      reloadError,
    },
    flush,
    reloadFromDisk,
  };
};
