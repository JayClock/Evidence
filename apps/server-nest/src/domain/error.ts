export type DomainErrorKind =
  | 'notFound'
  | 'conflict'
  | 'validation'
  | 'internal';

export class DomainError extends Error {
  private constructor(
    readonly kind: DomainErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static notFound(message: string): DomainError {
    return new DomainError('notFound', message);
  }

  static conflict(message: string): DomainError {
    return new DomainError('conflict', message);
  }

  static validation(message: string): DomainError {
    return new DomainError('validation', message);
  }

  static internal(message: string): DomainError {
    return new DomainError('internal', message);
  }
}
