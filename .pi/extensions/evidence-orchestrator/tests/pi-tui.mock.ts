export interface Component {
  render(width: number): string[];
  invalidate(): void;
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
