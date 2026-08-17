package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasMany;
import reengineering.ddd.evidence.domain.description.DiagramDescription;

public final class Diagram implements Entity<String, DiagramDescription> {
  private final String identity;
  private final DiagramDescription description;
  private final HasMany<String, DiagramNode> nodes;
  private final HasMany<String, DiagramEdge> edges;

  public Diagram(
      String identity,
      DiagramDescription description,
      HasMany<String, DiagramNode> nodes,
      HasMany<String, DiagramEdge> edges) {
    this.identity = identity;
    this.description = description;
    this.nodes = nodes;
    this.edges = edges;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public DiagramDescription getDescription() {
    return description;
  }

  public HasMany<String, DiagramNode> nodes() {
    return nodes;
  }

  public HasMany<String, DiagramEdge> edges() {
    return edges;
  }

  public record Position(double x, double y) {}
}
