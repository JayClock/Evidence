package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.DiagramEdgeDescription;

public final class DiagramEdge implements Entity<String, DiagramEdgeDescription> {
  private final String identity;
  private final DiagramEdgeDescription description;

  public DiagramEdge(String identity, DiagramEdgeDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public DiagramEdgeDescription getDescription() {
    return description;
  }
}
