package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import reengineering.ddd.evidence.domain.description.DiagramNodeDescription;

public final class DiagramNode implements Entity<String, DiagramNodeDescription> {
  private final String identity;
  private final DiagramNodeDescription description;

  public DiagramNode(String identity, DiagramNodeDescription description) {
    this.identity = identity;
    this.description = description;
  }

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public DiagramNodeDescription getDescription() {
    return description;
  }
}
