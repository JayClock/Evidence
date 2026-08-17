package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;
import java.time.Instant;
import java.util.Map;

public record DiagramEdgeDescription(
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
  public DiagramEdgeDescription {
    style = Map.copyOf(style);
    data = Map.copyOf(data);
    markerStart = markerStart == null ? null : Map.copyOf(markerStart);
    markerEnd = markerEnd == null ? null : Map.copyOf(markerEnd);
    pathOptions = Map.copyOf(pathOptions);
  }
}
