export type ServerErrorKind =
  | 'notFound'
  | 'conflict'
  | 'validation'
  | 'internal';

export class ServerError extends Error {
  private constructor(
    readonly kind: ServerErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ServerError';
  }

  static notFound(message: string): ServerError {
    return new ServerError('notFound', message);
  }

  static conflict(message: string): ServerError {
    return new ServerError('conflict', message);
  }

  static validation(message: string): ServerError {
    return new ServerError('validation', message);
  }

  static internal(message: string): ServerError {
    return new ServerError('internal', message);
  }
}
