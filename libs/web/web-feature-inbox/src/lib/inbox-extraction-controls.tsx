import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  InboxExtractionResource,
  InboxItemCollectionResource,
  State,
} from '@evidence/api-client';
import { Alert, AlertDescription, Button } from '@evidence/ui';

export function InboxExtractionControls({
  collectionState,
  selectedIds,
}: {
  collectionState: State<InboxItemCollectionResource>;
  selectedIds: string[];
}) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bridge = window.evidenceDesktop;

  const extract = async () => {
    if (
      pending ||
      selectedIds.length < 1 ||
      selectedIds.length > 5 ||
      !bridge?.runInboxAnalyst
    ) {
      return;
    }
    setPending(true);
    setError(null);
    setProgress('Freezing selected source revisions…');
    try {
      const extraction = (await collectionState
        .follow('inbox-extractions')
        .post({
          data: { inboxItemIds: selectedIds },
        })) as State<InboxExtractionResource>;
      const workspaceId = workspaceIdFromState(extraction);
      await bridge.runInboxAnalyst(
        {
          id: requestId('inbox'),
          workspaceId,
          extractionId: extraction.data.id,
        },
        (event) => {
          if (event.event === 'progress') setProgress(event.data);
          if (event.event === 'tool-start') {
            setProgress('Submitting the bounded Candidate set…');
          }
          if (event.event === 'error') setError(event.data);
        },
      );
      const href = extraction.getLink('story-candidates')?.href;
      if (!href) throw new Error('Extraction is missing its Candidate link.');
      navigate(href);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        disabled={
          pending ||
          selectedIds.length < 1 ||
          selectedIds.length > 5 ||
          !bridge?.runInboxAnalyst
        }
        type="button"
        onClick={() => void extract()}
      >
        {pending
          ? 'Analyzing…'
          : `Analyze ${String(selectedIds.length)} selected`}
      </Button>
      {!bridge?.runInboxAnalyst ? (
        <p className="max-w-xs text-xs text-muted-foreground">
          Open Evidence Desktop to run the local Inbox Analyst.
        </p>
      ) : null}
      {progress ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {progress}
        </p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function workspaceIdFromState(state: State<InboxExtractionResource>): string {
  const href = state.getLink('workspace')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1]) throw new Error('Extraction is missing its Workspace link.');
  return decodeURIComponent(match[1]);
}

function requestId(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  return `${prefix}:${value}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The selected Inbox sources could not be analyzed.';
}
