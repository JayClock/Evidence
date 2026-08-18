package reengineering.ddd.evidence.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import reengineering.ddd.evidence.api.ApiTemplates;
import reengineering.ddd.evidence.application.WorkspaceService;

public final class WorkspaceMembershipCollectionModel
    extends EvidenceModel<WorkspaceMembershipCollectionModel> {
  @JsonProperty("_embedded")
  private final Embedded embedded;

  @JsonProperty private final PageModel page;

  public WorkspaceMembershipCollectionModel(
      String workspaceId,
      WorkspaceService.MembershipPage memberships,
      int pageNumber,
      int pageSize,
      UriInfo uriInfo) {
    embedded =
        new Embedded(
            memberships.items().stream()
                .map(membership -> new WorkspaceMembershipModel(membership, uriInfo))
                .toList());
    page = PageModel.of(pageNumber, pageSize, memberships.total());
    addSelf(ApiTemplates.workspaceMembershipsPage(uriInfo, workspaceId, pageNumber, pageSize));
    addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
    if (pageNumber > 1) {
      addRelation(
          ApiTemplates.workspaceMembershipsPage(uriInfo, workspaceId, pageNumber - 1, pageSize),
          "prev");
    }
    if (pageNumber < page.totalPages()) {
      addRelation(
          ApiTemplates.workspaceMembershipsPage(uriInfo, workspaceId, pageNumber + 1, pageSize),
          "next");
    }
  }

  public record Embedded(@JsonProperty("memberships") List<WorkspaceMembershipModel> memberships) {}
}
