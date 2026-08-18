package reengineering.ddd.evidence.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import reengineering.ddd.evidence.api.ApiTemplates;
import reengineering.ddd.evidence.domain.model.Workspace;

public final class WorkspaceCollectionModel extends EvidenceModel<WorkspaceCollectionModel> {
  @JsonProperty("_embedded")
  private final Embedded embedded;

  @JsonProperty private final PageModel page;

  public WorkspaceCollectionModel(
      String userId,
      List<Workspace> workspaces,
      int total,
      int pageNumber,
      int pageSize,
      UriInfo uriInfo) {
    embedded =
        new Embedded(
            workspaces.stream().map(workspace -> new WorkspaceModel(workspace, uriInfo)).toList());
    page = PageModel.of(pageNumber, pageSize, total);
    addSelf(ApiTemplates.workspacesPage(uriInfo, pageNumber, pageSize));
    addRelation(ApiTemplates.currentUser(uriInfo, userId), "user");
    if (pageNumber > 1) {
      addRelation(ApiTemplates.workspacesPage(uriInfo, pageNumber - 1, pageSize), "prev");
    }
    if (pageNumber < page.totalPages()) {
      addRelation(ApiTemplates.workspacesPage(uriInfo, pageNumber + 1, pageSize), "next");
    }
  }

  public record Embedded(@JsonProperty("workspaces") List<WorkspaceModel> workspaces) {}
}
