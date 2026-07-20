export interface HasOne<E> {
  get(): Promise<E>;
}
