import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { updateEntityMutator } from '@evidence-poc/evidence-model-core';
import {
  installDesktopApi,
  projectSummary,
} from '@evidence-poc/desktop-testing/desktopApi';
import { useEditorSession } from './useEditorSession';

vi.mock('./useGraphLayout', () => ({
  useGraphLayout: () => ({ layout: {}, layoutError: null }),
}));

const setup = () => {
  const api = installDesktopApi();
  const document = createDesktopFixture();
  const project = projectSummary();
  const hook = renderHook(() =>
    useEditorSession(project, document, 'simplified', 'editor'),
  );
  const edit = (label: string) =>
    act(() =>
      hook.result.current.state.session.mutate(
        (draft) => updateEntityMutator(draft, 'evidence.contract', { label }),
        'update-entity',
      ),
    );
  return { api, document, project, hook, edit };
};

describe('editor live persistence', () => {
  it('submits edits and undo/redo without a save action, not selection changes', () => {
    const { api, edit, hook } = setup();
    const { session } = hook.result.current.state;
    act(() => session.select('evidence.contract'));
    expect(api.calls.persistence).toHaveLength(0);
    edit('同步修改');
    act(() => session.undo());
    act(() => session.redo());
    expect(api.calls.persistence.map(({ revision }) => revision)).toEqual([
      1, 2, 3,
    ]);
    expect(api.calls.persistence.at(-1)?.document).toBe(session.getDocument());
    expect(hook.result.current.state.persistence.kind).toBe('persisted');
  });

  it('does not let an older acknowledgement clear a newer pending edit', () => {
    const { api, edit, hook } = setup();
    api.projects.enqueuePersistence = async () => ({ success: true });
    edit('第一版');
    edit('第二版');
    act(() =>
      api.emitPersistenceStatus({
        persistenceId: 'editor',
        revision: 1,
        kind: 'persisted',
      }),
    );
    expect(hook.result.current.state.persistence.kind).toBe('queued');
    act(() =>
      api.emitPersistenceStatus({
        persistenceId: 'editor',
        revision: 2,
        kind: 'persisted',
      }),
    );
    expect(hook.result.current.state.persistence.kind).toBe('persisted');
  });

  it('reloads only on request and never submits the reloaded disk document as an edit', async () => {
    const { api, document, project, edit, hook } = setup();
    edit('本地修改');
    const external = {
      ...document,
      manifest: { ...document.manifest, name: '外部修改' },
    };
    api.projects.open = vi.fn(
      async () =>
        ({
          success: true,
          project,
          document: external,
          issues: [],
          persistenceId: 'reloaded',
        }) as const,
    );
    act(() =>
      api.emitPersistenceStatus({
        persistenceId: 'editor',
        revision: 1,
        kind: 'conflict',
        error: '磁盘变更',
      }),
    );
    expect(api.projects.open).not.toHaveBeenCalled();
    expect(hook.result.current.state.persistence.kind).toBe('conflict');
    await act(async () => hook.result.current.reloadFromDisk());
    expect(api.projects.open).toHaveBeenCalledWith(
      project.rootPath,
      'discard-pending',
    );
    expect(hook.result.current.state.document).toBe(external);
    expect(hook.result.current.state.canUndo).toBe(false);
    expect(api.calls.persistence).toHaveLength(1);
    edit('新会话编辑');
    expect(api.calls.persistence.at(-1)).toMatchObject({
      persistenceId: 'reloaded',
      revision: 1,
    });
  });

  it('keeps the current canvas when disk reload fails', async () => {
    const { api, edit, hook } = setup();
    edit('本地修改');
    const before = hook.result.current.state.document;
    api.projects.open = async () => ({ success: false, error: 'Git 冲突标记' });
    await act(async () => hook.result.current.reloadFromDisk());
    expect(hook.result.current.state.document).toBe(before);
    expect(hook.result.current.state.reloadError).toBe('Git 冲突标记');
  });
});
