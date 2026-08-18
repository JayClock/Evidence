package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.jayclock.smartdomain.core.Ref;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.InboxRevisionDescription;
import reengineering.ddd.evidence.domain.model.Inbox;
import reengineering.ddd.evidence.domain.model.InboxItem;
import reengineering.ddd.evidence.domain.model.InboxRevision;
import reengineering.ddd.evidence.persistent.mappers.InboxMapper;
import reengineering.ddd.evidence.persistent.mappers.InboxRows;

@AssociationMapping(entity = InboxItem.class, field = "revisions", parentIdField = "itemId")
public final class InboxItemRevisions extends EntityList<String, InboxRevision>
    implements InboxItem.Revisions {
  private static final TypeReference<Map<String, Object>> JSON_OBJECT = new TypeReference<>() {};

  private String itemId;
  @Inject private InboxMapper mapper;
  @Inject private ObjectMapper objectMapper;

  public InboxItemRevisions() {}

  InboxItemRevisions(String itemId, InboxMapper mapper, ObjectMapper objectMapper) {
    this.itemId = itemId;
    this.mapper = mapper;
    this.objectMapper = objectMapper;
  }

  @Override
  protected List<InboxRevision> findEntities(int from, int to) {
    return mapper.findRevisions(itemId, from, Math.max(to - from, 0)).stream()
        .map(this::revision)
        .toList();
  }

  @Override
  protected InboxRevision findEntity(String revisionId) {
    InboxRows.RevisionRow row = mapper.findItemRevision(itemId, revisionId);
    return row == null ? null : revision(row);
  }

  @Override
  public int size() {
    return mapper.countRevisions(itemId);
  }

  private InboxRevision revision(InboxRows.RevisionRow row) {
    return new InboxRevision(
        row.id(),
        new InboxRevisionDescription(
            new Ref<>(row.inboxItemId()),
            row.revisionNumber(),
            row.title(),
            row.body(),
            Inbox.ContentType.parse(row.contentType()),
            row.uri(),
            metadata(row.providerMetadata()),
            row.sourceUpdatedAt(),
            row.capturedAt(),
            row.contentSha256()));
  }

  private Map<String, Object> metadata(String json) {
    try {
      return CanonicalJson.normalizeObject(
          objectMapper.readValue(json, JSON_OBJECT), "provider metadata");
    } catch (JsonProcessingException error) {
      throw DomainException.internal("Inbox provider metadata could not be read");
    }
  }
}
