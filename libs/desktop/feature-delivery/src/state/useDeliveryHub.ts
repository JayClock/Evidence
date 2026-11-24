import type { EvidenceDesktopApi } from '@evidence-poc/desktop-contracts/ipc';
import { useEffect, useState } from 'react';
import type { ModelSession } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { LiveDeliveryPreview } from '@evidence-poc/desktop-contracts/delivery';
import type { DeliveryPreview } from '@evidence-poc/desktop-contracts/projects';

export interface DeliveryHubController {
  loading: boolean;
  stale: boolean;
  error: string | null;
  preview: DeliveryPreview | null;
  analysis: LiveDeliveryPreview | null;
}

/** Read-only authoring preview, separate from the persisted artifact pipeline. */
export const useDeliveryHub = (
  api: Pick<EvidenceDesktopApi['projects'], 'deliveryLivePreview'>,
  rootPath: string,
  session: ModelSession,
  baseDocument: DomainModelDocument,
  { includeArtifacts = false }: { includeArtifacts?: boolean } = {},
): DeliveryHubController => {
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<LiveDeliveryPreview | null>(null);

  useEffect(() => {
    setAnalysis(null);
    let active = true;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const revision = ++generation;
      setStale(true);
      setLoading(true);
      setError(null);
      clearTimeout(timer);
      timer = setTimeout(() => {
        void api
          .deliveryLivePreview({
            rootPath,
            revision,
            document: session.getDocument(),
            baseDocument,
            ...(includeArtifacts ? { includeArtifacts: true } : {}),
          })
          .then((result) => {
            if (!active || revision !== generation) return;
            if (!result.success) throw new Error(result.error);
            if (result.analysis.revision !== revision)
              throw new Error('API 预览版本不匹配。');
            setAnalysis(result.analysis);
            setStale(false);
          })
          .catch((cause: unknown) => {
            if (!active || revision !== generation) return;
            setAnalysis(null);
            setError(cause instanceof Error ? cause.message : String(cause));
          })
          .finally(() => {
            if (active && revision === generation) setLoading(false);
          });
      }, 150);
    };
    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'document-changed') refresh();
    });
    refresh();
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [api, rootPath, session, baseDocument, includeArtifacts]);

  return {
    loading,
    stale,
    error,
    preview: analysis?.preview ?? null,
    analysis,
  };
};
