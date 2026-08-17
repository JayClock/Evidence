package reengineering.ddd.evidence.domain.description;

import io.github.jayclock.smartdomain.core.Ref;

public record LogicalRelationshipDescription(
    Ref<String> workspace, Ref<String> source, Ref<String> target, String label) {}
