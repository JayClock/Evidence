package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.HasMany;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;

public final class Inbox {
  private static final Pattern SOURCE_KIND = Pattern.compile("^[a-z][a-z0-9_]*$");
  private static final int MAX_TITLE_LENGTH = 200;
  private static final int MAX_EXTERNAL_KEY_LENGTH = 256;
  private static final int MAX_BODY_BYTES = 1024 * 1024;
  private static final int MAX_METADATA_BYTES = 16 * 1024;

  private Inbox() {}

  public enum ItemStatus {
    ACTIVE,
    DEFERRED,
    CLOSED;

    public String wireValue() {
      return name().toLowerCase(Locale.ROOT);
    }

    public static ItemStatus parse(String value) {
      try {
        return valueOf(requiredLine(value, "status").toUpperCase(Locale.ROOT));
      } catch (IllegalArgumentException error) {
        throw DomainException.validation("unsupported Inbox status: " + value);
      }
    }
  }

  public enum ContentType {
    TEXT_PLAIN("text/plain"),
    TEXT_MARKDOWN("text/markdown");

    private final String wireValue;

    ContentType(String wireValue) {
      this.wireValue = wireValue;
    }

    public String wireValue() {
      return wireValue;
    }

    public static ContentType parse(String value) {
      for (ContentType contentType : values()) {
        if (contentType.wireValue.equals(value)) return contentType;
      }
      throw DomainException.validation("unsupported Inbox content type: " + value);
    }
  }

  public record SourceInput(
      String sourceKind,
      String externalKey,
      String title,
      String body,
      String contentType,
      String uri,
      Map<String, Object> providerMetadata,
      String sourceUpdatedAt) {}

  public record Source(
      String sourceKind,
      String externalKey,
      String title,
      String body,
      ContentType contentType,
      String uri,
      Map<String, Object> providerMetadata,
      Instant sourceUpdatedAt) {}

  public record HashedSource(Source source, String contentSha256) {}

  public record ListQuery(
      int page, int pageSize, ItemStatus status, String sourceKind, String query) {}

  public record Page<E>(List<E> items, int total) {
    public Page {
      items = List.copyOf(items);
    }
  }

  public record Captured(InboxItem item, InboxRevision revision, boolean revisionCreated) {}

  public interface Items extends HasMany<String, InboxItem> {
    Page<InboxItem> list(ListQuery query);

    Captured capture(SourceInput source);

    Captured appendRevision(String itemId, SourceInput source, String expectedLatestRevisionSha256);

    InboxItem changeStatus(String itemId, ItemStatus status, int expectedVersion);
  }

  public static HashedSource normalizeAndHash(SourceInput input) {
    if (input == null) throw DomainException.validation("Inbox source is required");
    String sourceKind = requiredLine(input.sourceKind(), "source kind");
    if (!SOURCE_KIND.matcher(sourceKind).matches()) {
      throw DomainException.validation("unsupported Inbox source kind: " + sourceKind);
    }
    String externalKey =
        limited(
            requiredLine(input.externalKey(), "external key"),
            MAX_EXTERNAL_KEY_LENGTH,
            "external key");
    String title = limited(requiredLine(input.title(), "title"), MAX_TITLE_LENGTH, "title");
    String body = normalizeBody(input.body());
    ContentType contentType = ContentType.parse(input.contentType());
    String uri = normalizeUri(input.uri());
    Map<String, Object> metadata =
        CanonicalJson.normalizeObject(
            input.providerMetadata() == null ? Map.of() : input.providerMetadata(),
            "provider metadata");
    if (CanonicalJson.stringify(metadata).getBytes(StandardCharsets.UTF_8).length
        > MAX_METADATA_BYTES) {
      throw DomainException.validation(
          "Inbox provider metadata must not exceed " + MAX_METADATA_BYTES + " bytes");
    }
    Instant sourceUpdatedAt = normalizeTimestamp(input.sourceUpdatedAt());
    Source source =
        new Source(
            sourceKind, externalKey, title, body, contentType, uri, metadata, sourceUpdatedAt);
    Map<String, Object> content = new java.util.LinkedHashMap<>();
    content.put("sourceKind", source.sourceKind());
    content.put("externalKey", source.externalKey());
    content.put("title", source.title());
    content.put("body", source.body());
    content.put("contentType", source.contentType().wireValue());
    content.put("uri", source.uri());
    content.put("providerMetadata", source.providerMetadata());
    content.put(
        "sourceUpdatedAt",
        source.sourceUpdatedAt() == null ? null : CanonicalJson.instant(source.sourceUpdatedAt()));
    return new HashedSource(source, CanonicalJson.hash(content));
  }

  public static void requireVersion(int version) {
    if (version <= 0) {
      throw DomainException.validation("Inbox expected version must be positive");
    }
  }

  public static void validatePage(int page, int pageSize) {
    if (page <= 0 || pageSize <= 0) {
      throw DomainException.validation("page and pageSize must be greater than 0");
    }
  }

  private static String normalizeBody(String value) {
    if (value == null || value.trim().isEmpty()) {
      throw DomainException.validation("Inbox body must not be empty");
    }
    String normalized = value.replace("\r\n", "\n").replace('\r', '\n');
    if (normalized.getBytes(StandardCharsets.UTF_8).length > MAX_BODY_BYTES) {
      throw DomainException.validation("Inbox body must not exceed " + MAX_BODY_BYTES + " bytes");
    }
    return normalized;
  }

  private static String normalizeUri(String value) {
    if (value == null || value.trim().isEmpty()) return null;
    try {
      URI uri = URI.create(value);
      String scheme = uri.getScheme();
      if (scheme == null
          || uri.getHost() == null
          || !("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
        throw new IllegalArgumentException();
      }
      return uri.normalize().toASCIIString();
    } catch (IllegalArgumentException error) {
      throw DomainException.validation("Inbox URI must be an absolute HTTP(S) URL");
    }
  }

  private static Instant normalizeTimestamp(String value) {
    if (value == null || value.trim().isEmpty()) return null;
    try {
      return Instant.parse(value.trim());
    } catch (DateTimeParseException error) {
      throw DomainException.validation(
          "Inbox source updated timestamp must be an ISO 8601 timestamp");
    }
  }

  private static String requiredLine(String value, String label) {
    if (value == null || value.trim().isEmpty()) {
      throw DomainException.validation("Inbox " + label + " must not be empty");
    }
    String normalized = value.trim();
    if (normalized.indexOf('\r') >= 0 || normalized.indexOf('\n') >= 0) {
      throw DomainException.validation("Inbox " + label + " must be a single line");
    }
    return normalized;
  }

  private static String limited(String value, int maximum, String label) {
    if (value.length() > maximum) {
      throw DomainException.validation(
          "Inbox " + label + " must not exceed " + maximum + " characters");
    }
    return value;
  }
}
