export class DynamicBorder {
  constructor(private readonly color: (text: string) => string) {}

  render(width: number): string[] {
    return [this.color('─'.repeat(Math.max(1, width)))];
  }

  invalidate(): void {
    return undefined;
  }
}

export class BorderedLoader {
  private readonly controller = new AbortController();
  private abortHandler: (() => void) | undefined;

  constructor(
    _tui: unknown,
    _theme: unknown,
    readonly message: string,
    options?: { cancellable?: boolean },
  ) {
    void options;
  }

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

  handleInput(data: string): void {
    if (data === 'escape') this.abort();
  }

  dispose(): void {
    return undefined;
  }

  render(): string[] {
    return [this.message];
  }

  invalidate(): void {
    return undefined;
  }
}
