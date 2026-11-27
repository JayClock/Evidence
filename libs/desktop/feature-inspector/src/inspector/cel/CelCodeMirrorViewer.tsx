import { useEffect, useMemo, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { bracketMatching } from '@codemirror/language';
import {
  analyzeCelExpression,
  type CelCandidate,
} from '@evidence-poc/evidence-cel';
import { celHighlighting, celLanguage } from './celLanguage';

const theme = EditorView.theme({
  '&': {
    fontSize: '11px',
    backgroundColor: '#fbfbfc',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
  },
  '.cm-scroller': {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: '1.5',
    maxHeight: '140px',
    overflow: 'auto',
  },
  '.cm-content': { padding: '4px 6px' },
  '.cm-content:focus-visible': {
    outline: '2px solid #2f5d8f',
    outlineOffset: '-2px',
  },
});

/** A selectable CEL view of the current graph value, never a draft. */
export const CelCodeMirrorViewer = ({
  value,
  candidates,
  ariaLabel,
}: {
  value: string;
  candidates: readonly CelCandidate[];
  ariaLabel: string;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const diagnostics = useMemo(
    () => analyzeCelExpression({ expression: value, candidates }).diagnostics,
    [value, candidates],
  );

  useEffect(() => {
    if (host.current === null) return;
    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        extensions: [
          celLanguage,
          celHighlighting,
          bracketMatching(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            tabindex: '0',
            'aria-label': ariaLabel,
            'aria-readonly': 'true',
          }),
          theme,
        ],
      }),
    });
    view.current = instance;
    return () => {
      view.current = null;
      instance.destroy();
    };
  }, [ariaLabel]);

  useEffect(() => {
    const instance = view.current;
    if (instance && instance.state.doc.toString() !== value) {
      instance.dispatch({
        changes: { from: 0, to: instance.state.doc.length, insert: value },
      });
    }
  }, [ariaLabel, value]);

  return (
    <div className="min-w-0">
      <div ref={host} className="w-full" />
      {diagnostics.length > 0 ? (
        <ul className="mt-0.5 text-[10px] text-evidence-evidence">
          {diagnostics.slice(0, 3).map((diagnostic) => (
            <li key={`${diagnostic.code}-${diagnostic.offset}`}>
              {diagnostic.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
