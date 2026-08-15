package reengineering.ddd.evidence.api;

import reengineering.ddd.evidence.domain.DomainException;

final class Pagination {
  private Pagination() {}

  static int page(String value) {
    return positive(value, 1, "page");
  }

  static int pageSize(String value) {
    return pageSize(value, 20);
  }

  static int pageSize(String value, int fallback) {
    return Math.min(positive(value, fallback, "pageSize"), 100);
  }

  private static int positive(String value, int fallback, String name) {
    if (value == null || value.isBlank()) return fallback;
    try {
      int parsed = Integer.parseInt(value);
      if (parsed > 0) return parsed;
    } catch (NumberFormatException ignored) {
      // Convert malformed transport input to the shared validation error contract.
    }
    throw DomainException.validation(name + " must be a positive integer");
  }
}
