export interface Component {
  render(width: number): string[];
  invalidate(): void;
}

const ANSI_PATTERN = new RegExp(
  String.raw`\u001b(?:\][^\u0007]*(?:\u0007|\u001b\\)|\[[0-?]*[ -/]*[@-~]|[@-_])`,
  'gu',
);

function displayWidth(character: string): number {
  const point = character.codePointAt(0) ?? 0;
  if (/\p{Mark}/u.test(character)) return 0;
  return point >= 0x1100 &&
    (point <= 0x115f ||
      point === 0x2329 ||
      point === 0x232a ||
      (point >= 0x2e80 && point <= 0xa4cf) ||
      (point >= 0xac00 && point <= 0xd7a3) ||
      (point >= 0xf900 && point <= 0xfaff) ||
      (point >= 0xfe10 && point <= 0xfe6f) ||
      (point >= 0xff00 && point <= 0xff60) ||
      (point >= 0xffe0 && point <= 0xffe6) ||
      (point >= 0x1f300 && point <= 0x1faff))
    ? 2
    : 1;
}

export function visibleWidth(value: string): number {
  return [...value.replace(ANSI_PATTERN, '')].reduce(
    (width, character) => width + displayWidth(character),
    0,
  );
}

export function truncateToWidth(
  value: string,
  width: number,
  ellipsis = '…',
): string {
  if (visibleWidth(value) <= width) return value;
  const suffix = visibleWidth(ellipsis) <= width ? ellipsis : '';
  const target = Math.max(0, width - visibleWidth(suffix));
  let result = '';
  let used = 0;
  for (const character of value.replace(ANSI_PATTERN, '')) {
    const next = displayWidth(character);
    if (used + next > target) break;
    result += character;
    used += next;
  }
  return result + suffix;
}

export function wrapTextWithAnsi(value: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    let line = '';
    let used = 0;
    for (const character of paragraph.replace(ANSI_PATTERN, '')) {
      const next = displayWidth(character);
      if (line && used + next > width) {
        lines.push(line);
        line = '';
        used = 0;
      }
      line += character;
      used += next;
    }
    lines.push(line);
  }
  return lines;
}

export interface SelectItem {
  value: string;
  label: string;
  description?: string;
}

interface SelectListTheme {
  selectedPrefix: (text: string) => string;
  selectedText: (text: string) => string;
  description: (text: string) => string;
  scrollInfo: (text: string) => string;
  noMatch: (text: string) => string;
}

export class SelectList implements Component {
  private selectedIndex = 0;
  onSelect?: (item: SelectItem) => void;
  onCancel?: () => void;

  constructor(
    private readonly items: SelectItem[],
    private readonly maxVisible: number,
    private readonly theme: SelectListTheme,
  ) {}

  setSelectedIndex(index: number): void {
    this.selectedIndex = Math.max(0, Math.min(index, this.items.length - 1));
  }

  getSelectedItem(): SelectItem | null {
    return this.items[this.selectedIndex] ?? null;
  }

  handleInput(data: string): void {
    if (data === 'up') {
      this.setSelectedIndex(
        this.selectedIndex === 0
          ? this.items.length - 1
          : this.selectedIndex - 1,
      );
    } else if (data === 'down') {
      this.setSelectedIndex(
        this.selectedIndex === this.items.length - 1
          ? 0
          : this.selectedIndex + 1,
      );
    } else if (data === 'enter') {
      const selected = this.getSelectedItem();
      if (selected) this.onSelect?.(selected);
    } else if (data === 'escape' || data === 'ctrl+c') {
      this.onCancel?.();
    }
  }

  render(width: number): string[] {
    if (this.items.length === 0) return [this.theme.noMatch('No actions')];
    const start = Math.max(
      0,
      Math.min(
        this.selectedIndex - Math.floor(this.maxVisible / 2),
        this.items.length - this.maxVisible,
      ),
    );
    const end = Math.min(this.items.length, start + this.maxVisible);
    const lines = this.items.slice(start, end).map((item, relativeIndex) => {
      const index = start + relativeIndex;
      const selected = index === this.selectedIndex;
      const prefix = selected ? this.theme.selectedPrefix('→ ') : '  ';
      const label = selected ? this.theme.selectedText(item.label) : item.label;
      const description = item.description
        ? this.theme.description(` — ${item.description}`)
        : '';
      return truncateToWidth(`${prefix}${label}${description}`, width, '');
    });
    if (start > 0 || end < this.items.length) {
      lines.push(
        this.theme.scrollInfo(
          `(${this.selectedIndex + 1}/${this.items.length})`,
        ),
      );
    }
    return lines;
  }

  invalidate(): void {
    return undefined;
  }
}

export class Text implements Component {
  constructor(
    private text: string,
    paddingX = 0,
    paddingY = 0,
  ) {
    void paddingX;
    void paddingY;
  }

  setText(text: string): void {
    this.text = text;
  }

  render(width: number): string[] {
    void width;
    return this.text.split('\n');
  }

  invalidate(): void {
    return undefined;
  }
}

export class Spacer implements Component {
  constructor(private readonly height: number) {}

  render(width: number): string[] {
    void width;
    return Array.from({ length: this.height }, () => '');
  }

  invalidate(): void {
    return undefined;
  }
}

export class Container implements Component {
  private readonly children: Component[] = [];

  addChild(child: Component): void {
    this.children.push(child);
  }

  render(width: number): string[] {
    return this.children.flatMap((child) => child.render(width));
  }

  invalidate(): void {
    this.children.forEach((child) => child.invalidate());
  }
}

export class Box implements Component {
  private readonly children: Component[] = [];

  constructor(
    private readonly paddingX = 0,
    private readonly paddingY = 0,
    private readonly background?: (text: string) => string,
  ) {}

  addChild(child: Component): void {
    this.children.push(child);
  }

  render(width: number): string[] {
    const horizontalPadding = ' '.repeat(this.paddingX);
    const contentWidth = Math.max(1, width - this.paddingX * 2);
    const content = this.children.flatMap((child) =>
      child
        .render(contentWidth)
        .map((line) => `${horizontalPadding}${line}${horizontalPadding}`),
    );
    const verticalPadding = Array.from({ length: this.paddingY }, () => '');
    return [...verticalPadding, ...content, ...verticalPadding].map((line) =>
      this.background ? this.background(line) : line,
    );
  }

  invalidate(): void {
    this.children.forEach((child) => child.invalidate());
  }
}
