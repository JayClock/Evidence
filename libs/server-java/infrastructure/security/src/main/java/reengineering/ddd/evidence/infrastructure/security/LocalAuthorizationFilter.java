package reengineering.ddd.evidence.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

final class LocalAuthorizationFilter extends OncePerRequestFilter {
  private final EvidenceSecuritySettings settings;
  private final ApiAuthenticationEntryPoint authenticationEntryPoint;

  LocalAuthorizationFilter(
      EvidenceSecuritySettings settings, ApiAuthenticationEntryPoint authenticationEntryPoint) {
    this.settings = settings;
    this.authenticationEntryPoint = authenticationEntryPoint;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return "/health".equals(request.getRequestURI())
        || "OPTIONS".equalsIgnoreCase(request.getMethod());
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String expected = settings.expectedAuthorization();
    String actual = request.getHeader("Authorization");
    if (expected != null && (actual == null || !constantTimeEqual(actual, expected))) {
      authenticationEntryPoint.commence(request, response, null);
      return;
    }

    SecurityContext context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(
        new UsernamePasswordAuthenticationToken(settings.userId(), null, List.of()));
    SecurityContextHolder.setContext(context);
    filterChain.doFilter(request, response);
  }

  private static boolean constantTimeEqual(String left, String right) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] leftDigest = digest.digest(left.getBytes(StandardCharsets.UTF_8));
      byte[] rightDigest = digest.digest(right.getBytes(StandardCharsets.UTF_8));
      return MessageDigest.isEqual(leftDigest, rightDigest);
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 is unavailable", error);
    }
  }
}
