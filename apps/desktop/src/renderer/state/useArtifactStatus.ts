import { useEffect, useState } from 'react';
import type { ArtifactStatus } from '@evidence-poc/desktop-contracts/delivery';

/** Only show artifacts of the revision currently confirmed on disk. */
export function useArtifactStatus(
  persistenceId: string | undefined,
  revision: number,
  persisted: boolean,
) {
  const [latest, setLatest] = useState<ArtifactStatus | null>(null);
  useEffect(() => {
    if (persistenceId === undefined) return;
    const api = window.evidenceAPI.projects;
    let seenEvent = false;
    let active = true;
    const unsubscribe = api.onArtifactStatus((event) => {
      if (event.persistenceId !== persistenceId) return;
      seenEvent = true;
      setLatest((previous) =>
        previous?.persistenceId === persistenceId &&
        previous.revision > event.revision
          ? previous
          : event,
      );
    });
    void api
      .readArtifactStatus(persistenceId)
      .then((snapshot) => {
        if (active && !seenEvent && snapshot?.persistenceId === persistenceId)
          setLatest(snapshot);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [persistenceId]);
  return persisted &&
    latest?.persistenceId === persistenceId &&
    latest?.revision === revision
    ? latest
    : null;
}
