export class Ref<T> {
  constructor(private readonly value: T) {}

  id(): T {
    return this.value;
  }

  intoId(): T {
    return this.value;
  }

  toString(): string {
    return String(this.value);
  }
}
