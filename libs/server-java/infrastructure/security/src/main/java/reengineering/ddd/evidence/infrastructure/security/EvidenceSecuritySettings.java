package reengineering.ddd.evidence.infrastructure.security;

import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.core.env.Environment;

public record EvidenceSecuritySettings(
    AuthenticationMode authMode,
    String expectedAuthorization,
    String userId,
    List<String> corsOrigins,
    String oidcIssuer,
    String oidcAudience,
    String oidcJwksUri,
    boolean oidcAutoProvision) {
  private static final Set<String> LOOPBACK_HOSTS =
      Set.of("127.0.0.1", "localhost", "::1", "[::1]");
  private static final Pattern USER_ID = Pattern.compile("^[a-zA-Z0-9][a-zA-Z0-9._-]*$");
  private static final List<String> LOCAL_CORS_ORIGINS =
      List.of("http://localhost:4200", "http://127.0.0.1:4200", "evidence://app");

  public static EvidenceSecuritySettings from(Environment environment) {
    AuthenticationMode mode =
        AuthenticationMode.parse(environment.getProperty("evidence.auth-mode", "local"));
    String authorization = trimToNull(environment.getProperty("evidence.api-authorization", ""));
    validateAuthorization(authorization);

    String configuredUserId = trimToNull(environment.getProperty("evidence.user-id", ""));
    String userId = configuredUserId == null ? "desktop-user" : configuredUserId;
    if (!USER_ID.matcher(userId).matches()) {
      throw new IllegalStateException("EVIDENCE_USER_ID contains unsupported characters.");
    }

    String host = environment.getProperty("server.address", "127.0.0.1");
    if (mode == AuthenticationMode.LOCAL && !isLoopbackHost(host) && authorization == null) {
      throw new IllegalStateException(
          "EVIDENCE_API_AUTHORIZATION is required when EVIDENCE_HOST is not loopback.");
    }

    OidcSettings oidc = oidcSettings(mode, environment);
    return new EvidenceSecuritySettings(
        mode,
        authorization,
        userId,
        corsOrigins(environment),
        oidc.issuer(),
        oidc.audience(),
        oidc.jwksUri(),
        booleanSetting(environment, "evidence.oidc.auto-provision", true));
  }

  private static OidcSettings oidcSettings(AuthenticationMode mode, Environment environment) {
    if (mode == AuthenticationMode.LOCAL) {
      return new OidcSettings(null, null, null);
    }
    String issuer =
        endpoint(environment.getProperty("evidence.oidc.issuer", ""), "EVIDENCE_OIDC_ISSUER");
    String audience =
        required(environment.getProperty("evidence.oidc.audience", ""), "EVIDENCE_OIDC_AUDIENCE");
    String configuredJwks = trimToNull(environment.getProperty("evidence.oidc.jwks-uri", ""));
    String jwksUri =
        configuredJwks == null ? null : endpoint(configuredJwks, "EVIDENCE_OIDC_JWKS_URI");
    return new OidcSettings(issuer, audience, jwksUri);
  }

  private static boolean booleanSetting(
      Environment environment, String property, boolean fallback) {
    String configured = trimToNull(environment.getProperty(property));
    if (configured == null) return fallback;
    if ("true".equalsIgnoreCase(configured)) return true;
    if ("false".equalsIgnoreCase(configured)) return false;
    throw new IllegalStateException("EVIDENCE_OIDC_AUTO_PROVISION must be true or false.");
  }

  private static void validateAuthorization(String authorization) {
    if (authorization != null
        && (authorization.length() > 4096
            || authorization.indexOf('\r') >= 0
            || authorization.indexOf('\n') >= 0)) {
      throw new IllegalStateException("EVIDENCE_API_AUTHORIZATION is invalid.");
    }
  }

  private static List<String> corsOrigins(Environment environment) {
    String configured = trimToNull(environment.getProperty("evidence.cors-origins", ""));
    if (configured == null) return LOCAL_CORS_ORIGINS;
    if ("*".equals(configured)) return List.of("*");
    return Arrays.stream(configured.split(","))
        .map(String::trim)
        .filter(origin -> !origin.isEmpty())
        .distinct()
        .toList();
  }

  private static String endpoint(String value, String name) {
    String normalized = required(value, name);
    URI uri;
    try {
      uri = URI.create(normalized);
    } catch (IllegalArgumentException error) {
      throw new IllegalStateException(name + " must be an absolute URL.", error);
    }
    if (!uri.isAbsolute() || uri.getHost() == null) {
      throw new IllegalStateException(name + " must be an absolute URL.");
    }
    if (!"https".equalsIgnoreCase(uri.getScheme())
        && !("http".equalsIgnoreCase(uri.getScheme()) && isLoopbackHost(uri.getHost()))) {
      throw new IllegalStateException(name + " must use HTTPS unless it targets loopback.");
    }
    return normalized;
  }

  private static boolean isLoopbackHost(String host) {
    return LOOPBACK_HOSTS.contains(host.trim().toLowerCase(Locale.ROOT));
  }

  private static String required(String value, String name) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      throw new IllegalStateException(name + " is required.");
    }
    if (normalized.length() > 2048
        || normalized.indexOf('\r') >= 0
        || normalized.indexOf('\n') >= 0) {
      throw new IllegalStateException(name + " is invalid.");
    }
    return normalized;
  }

  private static String trimToNull(String value) {
    if (value == null) return null;
    String normalized = value.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  public enum AuthenticationMode {
    LOCAL,
    OIDC;

    private static AuthenticationMode parse(String value) {
      String normalized = trimToNull(value);
      if (normalized == null) return LOCAL;
      try {
        return valueOf(normalized.toUpperCase(Locale.ROOT));
      } catch (IllegalArgumentException error) {
        throw new IllegalStateException("EVIDENCE_AUTH_MODE must be either local or oidc.", error);
      }
    }
  }

  private record OidcSettings(String issuer, String audience, String jwksUri) {}
}
