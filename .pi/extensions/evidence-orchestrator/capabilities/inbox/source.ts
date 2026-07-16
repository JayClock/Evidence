import type { CapturedInboxSource } from './model';

/** External adapters normalize provider data into this capture port. */
export interface InboxSourceAdapter<Input> {
  readonly kind: string;
  capture(
    input: Input,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<CapturedInboxSource>;
}
