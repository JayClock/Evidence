package reengineering.ddd.evidence.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.description.UserDescription;
import reengineering.ddd.evidence.domain.model.User;

class OidcUserProvisioningFilterTest {
  private final WorkspaceService workspaceService = mock(WorkspaceService.class);
  private final ApiAuthenticationEntryPoint entryPoint =
      new ApiAuthenticationEntryPoint(new ObjectMapper());
  private final EvidenceSecuritySettings settings =
      new EvidenceSecuritySettings(
          EvidenceSecuritySettings.AuthenticationMode.OIDC,
          null,
          "unused-local-user",
          List.of(),
          "https://identity.example.test",
          "evidence-api",
          "https://identity.example.test/jwks",
          true);

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void replacesTheOidcSubjectWithTheInternalUserIdentity() throws Exception {
    JwtAuthenticationToken authentication = new JwtAuthenticationToken(jwt());
    SecurityContextHolder.getContext().setAuthentication(authentication);
    when(workspaceService.resolveExternalIdentity(any(), anyBoolean()))
        .thenReturn(Optional.of(new User("user-1", new UserDescription("OIDC User", null))));
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api");
    MockHttpServletResponse response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);

    new OidcUserProvisioningFilter(settings, workspaceService, entryPoint)
        .doFilterInternal(request, response, chain);

    assertThat(SecurityContextHolder.getContext().getAuthentication().getName())
        .isEqualTo("user-1");
    verify(chain).doFilter(request, response);
  }

  @Test
  void rejectsAnIdentityWhenAutoProvisioningCannotResolveAUser() throws Exception {
    SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt()));
    when(workspaceService.resolveExternalIdentity(any(), anyBoolean()))
        .thenReturn(Optional.empty());
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api");
    MockHttpServletResponse response = new MockHttpServletResponse();

    new OidcUserProvisioningFilter(settings, workspaceService, entryPoint)
        .doFilterInternal(request, response, mock(FilterChain.class));

    assertThat(response.getStatus()).isEqualTo(401);
    assertThat(response.getContentAsString()).contains("Evidence API authentication failed");
  }

  private static Jwt jwt() {
    return new Jwt(
        "token",
        Instant.parse("2026-01-01T00:00:00Z"),
        Instant.parse("2026-01-01T01:00:00Z"),
        Map.of("alg", "none"),
        Map.of(
            "sub", "subject-1",
            "iss", "https://identity.example.test",
            "name", "OIDC User",
            "aud", List.of("evidence-api")));
  }
}
