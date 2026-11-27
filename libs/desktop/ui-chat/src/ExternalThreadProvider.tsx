import { type PropsWithChildren } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type ExternalStoreAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react';

export type ExternalThreadAdapter = ExternalStoreAdapter<ThreadMessageLike>;

/** Display a host-owned conversation through the assistant-ui runtime. */
export function ExternalThreadProvider({
  adapter,
  children,
}: PropsWithChildren<{ adapter: ExternalThreadAdapter }>) {
  const runtime = useExternalStoreRuntime(adapter);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
