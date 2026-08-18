package reengineering.ddd.evidence.api;

import io.github.jayclock.smartdomain.api.hateoas.media.VendorMediaType;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.UriInfo;
import reengineering.ddd.evidence.api.representation.MembershipCollectionModel;
import reengineering.ddd.evidence.domain.model.User;

public class UserMembershipsApi {
  private final User user;

  public UserMembershipsApi(User user) {
    this.user = user;
  }

  @GET
  @Produces(MediaType.APPLICATION_JSON)
  @VendorMediaType(ResourceTypes.MEMBERSHIPS)
  public MembershipCollectionModel findAll(
      @QueryParam("page") String pageInput,
      @QueryParam("pageSize") String pageSizeInput,
      @Context UriInfo uriInfo) {
    int page = Pagination.page(pageInput);
    int pageSize = Pagination.pageSize(pageSizeInput);
    var memberships = user.memberships().findAll();
    int total = memberships.size();
    int from = (int) Math.min((long) (page - 1) * pageSize, total);
    int to = Math.min(from + pageSize, total);
    return new MembershipCollectionModel(
        user.getIdentity(),
        memberships.subCollection(from, to).stream().toList(),
        total,
        page,
        pageSize,
        uriInfo);
  }
}
