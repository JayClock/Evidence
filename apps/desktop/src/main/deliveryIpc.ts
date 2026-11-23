import { ipcMain } from 'electron';
import type {
  LiveDeliveryInput,
  LiveDeliveryResult,
} from '@evidence-poc/desktop-contracts/delivery';
import { EVIDENCE_IPC_CHANNELS } from '@evidence-poc/desktop-contracts/ipc';
import { livePreviewOf } from './deliveryProjection';

/** The renderer can preview any current draft, but cannot trigger a write here. */
export function registerDeliveryIpc(): void {
  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.deliveryLivePreview,
    async (_event, input: LiveDeliveryInput): Promise<LiveDeliveryResult> => {
      try {
        return { success: true, analysis: await livePreviewOf(input) };
      } catch (error) {
        return {
          success: false,
          revision: input?.revision ?? -1,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}
