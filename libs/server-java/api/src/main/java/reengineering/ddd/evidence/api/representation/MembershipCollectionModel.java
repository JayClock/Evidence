package reengineering.ddd.evidence.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import reengineering.ddd.evidence.api.ApiTemplates;
import reengineering.ddd.evidence.domain.model.Membership;

public final class MembershipCollectionModel extends EvidenceModel<MembershipCollectionModel> {
  @JsonProperty("_embedded")
  private final Embedded embedded;

  @JsonProperty private final PageModel page;

  public MembershipCollectionModel(
      String userId,
      List<Membership> memberships,
      int total,
      int pageNumber,
      int pageSize,
      UriInfo uriInfo) {
    embedded =
        new Embedded(
            memberships.stream()
                .map(membership -> new MembershipModel(membership, uriInfo))
                .toList());
    page = PageModel.of(pageNumber, pageSize, total);
    addSelf(ApiTemplates.userMembershipsPage(uriInfo, userId, pageNumber, pageSize));
    addRelation(ApiTemplates.user(uriInfo, userId), "user");
    if (pageNumber > 1) {
      addRelation(
          ApiTemplates.userMembershipsPage(uriInfo, userId, pageNumber - 1, pageSize), "prev");
    }
    if (pageNumber < page.totalPages()) {
      addRelation(
          ApiTemplates.userMembershipsPage(uriInfo, userId, pageNumber + 1, pageSize), "next");
    }
  }

  public record Embedded(@JsonProperty("memberships") List<MembershipModel> memberships) {}
}
