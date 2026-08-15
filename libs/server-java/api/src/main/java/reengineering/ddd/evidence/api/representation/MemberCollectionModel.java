package reengineering.ddd.evidence.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import reengineering.ddd.evidence.api.ApiTemplates;
import reengineering.ddd.evidence.application.WorkspaceService;

public final class MemberCollectionModel extends EvidenceModel<MemberCollectionModel> {
  @JsonProperty("_embedded")
  private final Embedded embedded;

  @JsonProperty private final PageModel page;

  public MemberCollectionModel(
      String workspaceId,
      WorkspaceService.MemberPage members,
      int pageNumber,
      int pageSize,
      UriInfo uriInfo) {
    embedded =
        new Embedded(
            members.items().stream().map(member -> new MemberModel(member, uriInfo)).toList());
    page = PageModel.of(pageNumber, pageSize, members.total());
    addSelf(ApiTemplates.workspaceMembers(uriInfo, workspaceId));
    addRelation(ApiTemplates.workspace(uriInfo, workspaceId), "workspace");
    if (pageNumber > 1) {
      addRelation(
          ApiTemplates.workspaceMembersPage(uriInfo, workspaceId, pageNumber - 1, pageSize),
          "prev");
    }
    if (pageNumber < page.totalPages()) {
      addRelation(
          ApiTemplates.workspaceMembersPage(uriInfo, workspaceId, pageNumber + 1, pageSize),
          "next");
    }
  }

  public record Embedded(@JsonProperty("members") List<MemberModel> members) {}
}
