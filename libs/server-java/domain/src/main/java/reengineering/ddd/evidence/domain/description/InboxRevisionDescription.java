package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.Map;
import reengineering.ddd.evidence.domain.model.Inbox;

public record InboxRevisionDescription(
    Ref<String> item,
    int revisionNumber,
    String title,
    String body,
    Inbox.ContentType contentType,
    String uri,
    Map<String, Object> providerMetadata,
    Instant sourceUpdatedAt,
    Instant capturedAt,
    String contentSha256) {
  public InboxRevisionDescription {
    providerMetadata = Map.copyOf(providerMetadata);
  }
}
