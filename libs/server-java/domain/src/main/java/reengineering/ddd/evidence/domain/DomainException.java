package reengineering.ddd.evidence.domain;

public final class DomainException extends RuntimeException {
  private final Kind kind;

  private DomainException(Kind kind, String message) {
    super(message);
    this.kind = kind;
  }

  public Kind kind() {
    return kind;
  }

  public static DomainException notFound(String message) {
    return new DomainException(Kind.NOT_FOUND, message);
  }

  public static DomainException forbidden(String message) {
    return new DomainException(Kind.FORBIDDEN, message);
  }

  public static DomainException conflict(String message) {
    return new DomainException(Kind.CONFLICT, message);
  }

  public static DomainException validation(String message) {
    return new DomainException(Kind.VALIDATION, message);
  }

  public static DomainException internal(String message) {
    return new DomainException(Kind.INTERNAL, message);
  }

  public enum Kind {
    NOT_FOUND,
    FORBIDDEN,
    CONFLICT,
    VALIDATION,
    INTERNAL
  }
}
