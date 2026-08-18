package reengineering.ddd.evidence.persistent.associations;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.jayclock.smartdomain.core.Ref;
import io.github.jayclock.smartdomain.mybatis.AssociationMapping;
import io.github.jayclock.smartdomain.mybatis.database.EntityList;
import jakarta.inject.Inject;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import reengineering.ddd.evidence.domain.CanonicalJson;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.description.InboxItemDescription;
import reengineering.ddd.evidence.domain.model.Inbox;
import reengineering.ddd.evidence.domain.model.InboxItem;
import reengineering.ddd.evidence.domain.model.InboxRevision;
import reengineering.ddd.evidence.domain.model.Workspace;
import reengineering.ddd.evidence.persistent.mappers.InboxMapper;
import reengineering.ddd.evidence.persistent.mappers.InboxRows;

@AssociationMapping(entity = Workspace.class, field = "inboxItems", parentIdField = "workspaceId")
public final class WorkspaceInboxItems extends EntityList<String, InboxItem>
    implements Workspace.InboxItems {
  private String workspaceId;
  @Inject private InboxMapper mapper;
  @Inject private ObjectMapper objectMapper;
  @Inject private Clock clock;

  @Override
  protected List<InboxItem> findEntities(int from, int to) {
    return mapper.findItems(workspaceId, null, null, null, from, Math.max(to - from, 0)).stream()
        .map(this::item)
        .toList();
  }

  @Override
  protected InboxItem findEntity(String id) {
    InboxRows.ItemRow row = mapper.findItem(workspaceId, id);
    return row == null ? null : item(row);
  }

  @Override
  public int size() {
    return mapper.countItems(workspaceId, null, null, null);
  }

  @Override
  public Inbox.Page<InboxItem> list(Inbox.ListQuery query) {
    Inbox.validatePage(query.page(), query.pageSize());
    String sourceKind = optionalQuery(query.sourceKind());
    String search = optionalQuery(query.query());
    String status = query.status() == null ? null : query.status().wireValue();
    return new Inbox.Page<>(
        mapper
            .findItems(
                workspaceId,
                status,
                sourceKind,
                search,
                (query.page() - 1) * query.pageSize(),
                query.pageSize())
            .stream()
            .map(this::item)
            .toList(),
        mapper.countItems(workspaceId, status, sourceKind, search));
  }

  @Override
  public Inbox.Captured capture(Inbox.SourceInput sourceInput) {
    Inbox.HashedSource hashed = Inbox.normalizeAndHash(sourceInput);
    Inbox.Source source = hashed.source();
    mapper.lockSource(workspaceId, source.sourceKind(), source.externalKey());
    InboxRows.ItemRow existing =
        mapper.findSourceItem(workspaceId, source.sourceKind(), source.externalKey());
    if (existing != null) return appendRevision(existing.id(), sourceInput, null);

    String itemId = UUID.randomUUID().toString();
    String revisionId = UUID.randomUUID().toString();
    Instant timestamp = timestamp();
    mapper.insertItem(itemId, workspaceId, source, timestamp);
    mapper.insertRevision(
        revisionId,
        itemId,
        1,
        source,
        CanonicalJson.stringify(source.providerMetadata()),
        hashed.contentSha256(),
        timestamp);
    if (mapper.setInitialLatestRevision(workspaceId, itemId, revisionId) != 1) {
      throw DomainException.internal("Inbox item " + itemId + " was not persisted");
    }
    return captureResult(itemId, revisionId, true);
  }

  @Override
  public Inbox.Captured appendRevision(
      String itemId, Inbox.SourceInput sourceInput, String expectedLatestRevisionSha256) {
    Inbox.HashedSource hashed = Inbox.normalizeAndHash(sourceInput);
    Inbox.Source source = hashed.source();
    InboxRows.ItemRow current = mapper.lockItem(workspaceId, itemId);
    if (current == null) throw DomainException.notFound("Inbox item " + itemId + " not found");
    if (!current.sourceKind().equals(source.sourceKind())
        || !current.externalKey().equals(source.externalKey())) {
      throw DomainException.validation("Inbox revision source must match item " + itemId);
    }
    if (expectedLatestRevisionSha256 != null
        && !current.latestRevisionSha256().equals(expectedLatestRevisionSha256)) {
      throw DomainException.conflict("Inbox item " + itemId + " latest revision has changed");
    }
    if (current.latestRevisionSha256().equals(hashed.contentSha256())) {
      return captureResult(itemId, current.latestRevisionId(), false);
    }

    Instant timestamp = timestamp();
    InboxRows.RevisionRow historical = mapper.findRevisionByHash(itemId, hashed.contentSha256());
    if (historical != null) {
      updateLatest(current, source.title(), historical.id(), timestamp);
      return captureResult(itemId, historical.id(), false);
    }

    String revisionId = UUID.randomUUID().toString();
    mapper.insertRevision(
        revisionId,
        itemId,
        current.revisionCount() + 1,
        source,
        CanonicalJson.stringify(source.providerMetadata()),
        hashed.contentSha256(),
        timestamp);
    updateLatest(current, source.title(), revisionId, timestamp);
    return captureResult(itemId, revisionId, true);
  }

  @Override
  public InboxItem changeStatus(String itemId, Inbox.ItemStatus status, int expectedVersion) {
    Inbox.requireVersion(expectedVersion);
    requireItem(itemId);
    if (mapper.updateItemStatus(
            workspaceId, itemId, expectedVersion, status.wireValue(), timestamp())
        != 1) {
      throw DomainException.conflict("Inbox item " + itemId + " has changed");
    }
    return requireItem(itemId);
  }

  private void updateLatest(
      InboxRows.ItemRow current, String title, String revisionId, Instant timestamp) {
    if (mapper.updateLatestRevision(
            workspaceId, current.id(), current.version(), title, revisionId, timestamp)
        != 1) {
      throw DomainException.conflict("Inbox item " + current.id() + " has changed");
    }
  }

  private Inbox.Captured captureResult(String itemId, String revisionId, boolean revisionCreated) {
    InboxItem item = requireItem(itemId);
    InboxRevision revision =
        item.revisions()
            .findByIdentity(revisionId)
            .orElseThrow(
                () -> DomainException.internal("Inbox item " + itemId + " was not persisted"));
    return new Inbox.Captured(item, revision, revisionCreated);
  }

  private InboxItem requireItem(String itemId) {
    return findByIdentity(itemId)
        .orElseThrow(() -> DomainException.notFound("Inbox item " + itemId + " not found"));
  }

  private InboxItem item(InboxRows.ItemRow row) {
    if (row.latestRevisionId() == null || row.latestRevisionSha256() == null) {
      throw DomainException.internal("Inbox item " + row.id() + " has no latest revision");
    }
    return new InboxItem(
        row.id(),
        new InboxItemDescription(
            new Ref<>(row.workspaceId()),
            row.sourceKind(),
            row.externalKey(),
            row.title(),
            Inbox.ItemStatus.parse(row.status()),
            row.latestRevisionId(),
            row.latestRevisionSha256(),
            row.revisionCount(),
            row.version(),
            row.createdAt(),
            row.updatedAt()),
        new InboxItemRevisions(row.id(), mapper, objectMapper));
  }

  private Instant timestamp() {
    return clock.instant().truncatedTo(ChronoUnit.MILLIS);
  }

  private static String optionalQuery(String value) {
    if (value == null || value.trim().isEmpty()) return null;
    return value.trim();
  }
}
