package reengineering.ddd.evidence.domain.validation;

import java.util.Locale;
import reengineering.ddd.evidence.domain.DomainException;

public final class WorkspaceAccess {
  private WorkspaceAccess() {}

  public static String role(String value, Role defaultRole) {
    String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    if (normalized.isEmpty() && defaultRole != null) return defaultRole.wireValue();
    try {
      return Role.valueOf(normalized.toUpperCase(Locale.ROOT)).wireValue();
    } catch (IllegalArgumentException error) {
      throw DomainException.validation("unsupported workspace role: " + value);
    }
  }

  public static boolean allows(String role, Permission permission) {
    String normalized;
    try {
      normalized = role(role, null);
    } catch (DomainException error) {
      return false;
    }
    return switch (Role.valueOf(normalized.toUpperCase(Locale.ROOT))) {
      case OWNER -> true;
      case MEMBER -> permission != Permission.MANAGE;
      case VIEWER -> permission == Permission.READ;
    };
  }

  public enum Permission {
    READ,
    WRITE,
    MANAGE
  }

  public enum Role {
    OWNER,
    MEMBER,
    VIEWER;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }
  }
}
