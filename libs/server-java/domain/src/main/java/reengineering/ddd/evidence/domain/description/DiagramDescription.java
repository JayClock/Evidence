package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;

public record DiagramDescription(
    Ref<String> workspace, String title, Viewport viewport, Instant createdAt, Instant updatedAt) {
  public record Viewport(double x, double y, double zoom) {
    public static Viewport defaultViewport() {
      return new Viewport(0, 0, 1);
    }
  }
}
