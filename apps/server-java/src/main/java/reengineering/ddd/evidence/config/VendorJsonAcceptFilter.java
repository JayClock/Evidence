package reengineering.ddd.evidence.config;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.PreMatching;
import jakarta.ws.rs.core.HttpHeaders;
import java.io.IOException;

@PreMatching
public final class VendorJsonAcceptFilter implements ContainerRequestFilter {
  @Override
  public void filter(ContainerRequestContext requestContext) throws IOException {
    String accept = requestContext.getHeaderString(HttpHeaders.ACCEPT);
    if (accept != null && accept.contains("application/*+json")) {
      requestContext.getHeaders().putSingle(HttpHeaders.ACCEPT, "application/json");
    }
  }
}
