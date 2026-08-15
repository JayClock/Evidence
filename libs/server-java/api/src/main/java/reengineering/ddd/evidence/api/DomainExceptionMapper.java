package reengineering.ddd.evidence.api;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import java.util.Map;
import reengineering.ddd.evidence.domain.DomainException;

@Provider
public final class DomainExceptionMapper implements ExceptionMapper<DomainException> {
  @Override
  public Response toResponse(DomainException exception) {
    Response.Status status =
        switch (exception.kind()) {
          case NOT_FOUND -> Response.Status.NOT_FOUND;
          case FORBIDDEN -> Response.Status.FORBIDDEN;
          case CONFLICT -> Response.Status.CONFLICT;
          case VALIDATION -> Response.Status.BAD_REQUEST;
          case INTERNAL -> Response.Status.INTERNAL_SERVER_ERROR;
        };
    return Response.status(status)
        .type(MediaType.APPLICATION_JSON_TYPE)
        .entity(Map.of("error", exception.getMessage()))
        .build();
  }
}
