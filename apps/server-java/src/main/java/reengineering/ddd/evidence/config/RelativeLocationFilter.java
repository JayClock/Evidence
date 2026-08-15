package reengineering.ddd.evidence.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import java.io.IOException;
import java.net.URI;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public final class RelativeLocationFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    filterChain.doFilter(
        request,
        new HttpServletResponseWrapper(response) {
          @Override
          public void setHeader(String name, String value) {
            super.setHeader(name, normalize(name, value));
          }

          @Override
          public void addHeader(String name, String value) {
            super.addHeader(name, normalize(name, value));
          }
        });
  }

  private static String normalize(String name, String value) {
    if (!"Location".equalsIgnoreCase(name) || value == null) return value;
    URI location = URI.create(value);
    if (!location.isAbsolute()) return value;
    StringBuilder relative = new StringBuilder(location.getRawPath());
    if (location.getRawQuery() != null) relative.append('?').append(location.getRawQuery());
    if (location.getRawFragment() != null) relative.append('#').append(location.getRawFragment());
    return relative.toString();
  }
}
