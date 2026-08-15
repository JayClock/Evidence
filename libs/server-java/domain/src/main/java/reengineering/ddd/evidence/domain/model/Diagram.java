package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasMany;
import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.Map;

public final class Diagram implements Entity<String, Diagram.Description> {
  private final String identity;
  private final Description description;
  private final HasMany<String, Node> nodes;
  private final HasMany<String, Edge> edges;

  public Diagram(
      String identity,
      Description description,
      HasMany<String, Node> nodes,
      HasMany<String, Edge> edges) {
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
  public Description getDescription() {
    return description;
  }

  public HasMany<String, Node> nodes() {
    return nodes;
  }

  public HasMany<String, Edge> edges() {
    return edges;
  }

  public record Description(
      Ref<String> workspace,
      String title,
      Viewport viewport,
      Instant createdAt,
      Instant updatedAt) {}

  public record Viewport(double x, double y, double zoom) {
    public static Viewport defaultViewport() {
      return new Viewport(0, 0, 1);
    }
  }

  public record Position(double x, double y) {}

  public static final class Node implements Entity<String, Node.Description> {
    private final String identity;
    private final Description description;

    public Node(String identity, Description description) {
      this.identity = identity;
      this.description = description;
    }

    @Override
    public String getIdentity() {
      return identity;
    }

    @Override
    public Description getDescription() {
      return description;
    }

    public record Description(
        Ref<String> diagram,
        String kind,
        Ref<String> logicalEntity,
        Ref<String> parent,
        Position position,
        Double width,
        Double height,
        Map<String, Object> data,
        Instant createdAt,
        Instant updatedAt) {
      public Description {
        data = Map.copyOf(data);
      }
    }
  }

  public static final class Edge implements Entity<String, Edge.Description> {
    private final String identity;
    private final Description description;

    public Edge(String identity, Description description) {
      this.identity = identity;
      this.description = description;
    }

    @Override
    public String getIdentity() {
      return identity;
    }

    @Override
    public Description getDescription() {
      return description;
    }

    public record Description(
        Ref<String> diagram,
        Ref<String> source,
        Ref<String> target,
        Ref<String> logicalRelationship,
        String sourceHandle,
        String targetHandle,
        String kind,
        Map<String, Object> style,
        Map<String, Object> data,
        boolean animated,
        boolean hidden,
        Map<String, Object> markerStart,
        Map<String, Object> markerEnd,
        Map<String, Object> pathOptions,
        Double interactionWidth,
        Instant createdAt,
        Instant updatedAt) {
      public Description {
        style = Map.copyOf(style);
        data = Map.copyOf(data);
        markerStart = markerStart == null ? null : Map.copyOf(markerStart);
        markerEnd = markerEnd == null ? null : Map.copyOf(markerEnd);
        pathOptions = Map.copyOf(pathOptions);
      }
    }
  }
}
