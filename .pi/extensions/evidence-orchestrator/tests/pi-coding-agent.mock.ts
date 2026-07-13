export class BorderedLoader {
  private readonly controller = new AbortController();
  private abortHandler: (() => void) | undefined;

  constructor(
    _tui: unknown,
    _theme: unknown,
    readonly message: string,
    _options?: { cancellable?: boolean },
  ) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  set onAbort(handler: (() => void) | undefined) {
    this.abortHandler = handler;
  }

  abort(): void {
    this.controller.abort();
    this.abortHandler?.();
  }

  render(): string[] {
    return [this.message];
  }

  invalidate(): void {
    return undefined;
  }
}
