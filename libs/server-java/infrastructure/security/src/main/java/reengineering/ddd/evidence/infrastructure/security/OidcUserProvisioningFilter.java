package reengineering.ddd.evidence.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.model.User;
import reengineering.ddd.evidence.domain.model.Users;

final class OidcUserProvisioningFilter extends OncePerRequestFilter {
  private final EvidenceSecuritySettings settings;
  private final WorkspaceService workspaceService;
  private final ApiAuthenticationEntryPoint authenticationEntryPoint;

  OidcUserProvisioningFilter(
      EvidenceSecuritySettings settings,
      WorkspaceService workspaceService,
      ApiAuthenticationEntryPoint authenticationEntryPoint) {
    this.settings = settings;
    this.workspaceService = workspaceService;
    this.authenticationEntryPoint = authenticationEntryPoint;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return settings.authMode() != EvidenceSecuritySettings.AuthenticationMode.OIDC
        || "/health".equals(request.getRequestURI())
        || "OPTIONS".equalsIgnoreCase(request.getMethod());
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    if (!(SecurityContextHolder.getContext().getAuthentication()
        instanceof JwtAuthenticationToken authentication)) {
      authenticationEntryPoint.commence(
          request,
          response,
          new InsufficientAuthenticationException("OIDC authentication is unavailable"));
      return;
    }

    Users.ExternalIdentity identity;
    try {
      identity = identity(authentication);
    } catch (IllegalArgumentException error) {
      authenticationEntryPoint.commence(
          request, response, new InsufficientAuthenticationException(error.getMessage(), error));
      return;
    }

    Optional<User> user =
        workspaceService.resolveExternalIdentity(identity, settings.oidcAutoProvision());
    if (user.isEmpty()) {
      authenticationEntryPoint.commence(
          request,
          response,
          new InsufficientAuthenticationException("OIDC identity is not provisioned"));
      return;
    }

    UsernamePasswordAuthenticationToken internalAuthentication =
        new UsernamePasswordAuthenticationToken(
            user.orElseThrow().getIdentity(),
            authentication.getToken(),
            authentication.getAuthorities());
    internalAuthentication.setDetails(authentication.getDetails());
    SecurityContextHolder.getContext().setAuthentication(internalAuthentication);
    filterChain.doFilter(request, response);
  }

  private Users.ExternalIdentity identity(JwtAuthenticationToken authentication) {
    String subject = bounded(authentication.getToken().getSubject(), 500, "OIDC subject");
    String email = optionalBounded(authentication.getToken().getClaimAsString("email"), 320);
    String name = optionalBounded(authentication.getToken().getClaimAsString("name"), 200);
    if (name == null) {
      name = optionalBounded(authentication.getToken().getClaimAsString("preferred_username"), 200);
    }
    if (name == null) name = email == null ? subject : email;
    return new Users.ExternalIdentity(settings.oidcIssuer(), subject, name, email);
  }

  private static String bounded(String value, int maximum, String name) {
    String normalized = optionalBounded(value, maximum);
    if (normalized == null) throw new IllegalArgumentException(name + " is required");
    return normalized;
  }

  private static String optionalBounded(String value, int maximum) {
    if (value == null) return null;
    String normalized = value.trim();
    if (normalized.isEmpty()) return null;
    if (normalized.length() > maximum
        || normalized.indexOf('\r') >= 0
        || normalized.indexOf('\n') >= 0) {
      throw new IllegalArgumentException("OIDC claim is invalid");
    }
    return normalized;
  }
}
