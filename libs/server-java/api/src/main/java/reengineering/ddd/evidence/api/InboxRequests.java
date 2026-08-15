package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Inbox;
import reengineering.ddd.evidence.domain.model.InboxWorkflow;

final class InboxRequests {
  private InboxRequests() {}

  static Inbox.SourceInput source(JsonNode input) {
    requireObject(input, "request body is required");
    return new Inbox.SourceInput(
        requiredString(input.get("sourceKind"), "sourceKind", true),
        requiredString(input.get("externalKey"), "externalKey", true),
        requiredString(input.get("title"), "title", true),
        requiredString(input.get("body"), "body", false),
        requiredString(input.get("contentType"), "contentType", true),
        optionalString(input.get("uri"), "uri"),
        metadata(input.get("providerMetadata")),
        optionalString(input.get("sourceUpdatedAt"), "sourceUpdatedAt"));
  }

  static List<InboxWorkflow.CandidateInput> candidates(JsonNode value) {
    if (value == null || !value.isArray()) {
      throw DomainException.validation("candidates must be an array");
    }
    List<InboxWorkflow.CandidateInput> candidates = new ArrayList<>();
    for (int index = 0; index < value.size(); index++) {
      JsonNode candidate = value.get(index);
      requireObject(candidate, "candidates[" + index + "] must be an object");
      candidates.add(
          new InboxWorkflow.CandidateInput(
              requiredString(candidate.get("title"), "candidates[" + index + "].title", true),
              requiredString(candidate.get("problem"), "candidates[" + index + "].problem", true),
              requiredString(candidate.get("role"), "candidates[" + index + "].role", true),
              requiredString(candidate.get("goal"), "candidates[" + index + "].goal", true),
              requiredString(candidate.get("value"), "candidates[" + index + "].value", true),
              requiredString(
                  candidate.get("cognitiveMode"), "candidates[" + index + "].cognitiveMode", true),
              citations(candidate.get("citations"), "candidates[" + index + "].citations")));
    }
    return candidates;
  }

  static List<String> stringArray(JsonNode value, String name) {
    if (value == null || !value.isArray()) {
      throw DomainException.validation(name + " must be an array");
    }
    List<String> values = new ArrayList<>();
    for (int index = 0; index < value.size(); index++) {
      values.add(requiredString(value.get(index), name + "[" + index + "]", true));
    }
    return values;
  }

  static int positiveInteger(JsonNode value, String name) {
    if (value == null
        || !value.isIntegralNumber()
        || !value.canConvertToInt()
        || value.asInt() <= 0) {
      throw DomainException.validation(name + " must be a positive integer");
    }
    return value.asInt();
  }

  static String requiredString(JsonNode value, String name) {
    return requiredString(value, name, true);
  }

  static String requiredString(JsonNode value, String name, boolean trim) {
    if (value == null || !value.isTextual() || value.asText().trim().isEmpty()) {
      throw DomainException.validation(name + " is required");
    }
    return trim ? value.asText().trim() : value.asText();
  }

  static String optionalString(JsonNode value, String name) {
    if (value == null || value.isNull() || (value.isTextual() && value.asText().isEmpty())) {
      return null;
    }
    if (!value.isTextual()) throw DomainException.validation(name + " must be a string");
    return value.asText();
  }

  static Map<String, Object> metadata(JsonNode value) {
    if (value == null || value.isNull()) return Map.of();
    if (!value.isObject()) {
      throw DomainException.validation("providerMetadata must be an object");
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> result = (Map<String, Object>) jsonValue(value);
    return result;
  }

  static void requireObject(JsonNode input, String message) {
    if (input == null || !input.isObject()) throw DomainException.validation(message);
  }

  private static List<InboxWorkflow.CitationInput> citations(JsonNode value, String name) {
    if (value == null || !value.isArray()) {
      throw DomainException.validation(name + " must be an array");
    }
    List<InboxWorkflow.CitationInput> citations = new ArrayList<>();
    for (int index = 0; index < value.size(); index++) {
      JsonNode citation = value.get(index);
      requireObject(citation, name + "[" + index + "] must be an object");
      citations.add(
          new InboxWorkflow.CitationInput(
              requiredString(citation.get("inboxItemId"), name + "[" + index + "].inboxItemId"),
              requiredString(
                  citation.get("revisionSha256"), name + "[" + index + "].revisionSha256"),
              requiredString(citation.get("locator"), name + "[" + index + "].locator")));
    }
    return citations;
  }

  private static Object jsonValue(JsonNode value) {
    if (value == null || value.isNull()) return null;
    if (value.isTextual()) return value.asText();
    if (value.isBoolean()) return value.asBoolean();
    if (value.isIntegralNumber()) return value.bigIntegerValue();
    if (value.isFloatingPointNumber()) return value.decimalValue();
    if (value.isArray()) {
      List<Object> values = new ArrayList<>();
      value.forEach(entry -> values.add(jsonValue(entry)));
      return java.util.Collections.unmodifiableList(values);
    }
    if (value.isObject()) {
      Map<String, Object> values = new LinkedHashMap<>();
      value.properties().forEach(entry -> values.put(entry.getKey(), jsonValue(entry.getValue())));
      return java.util.Collections.unmodifiableMap(values);
    }
    throw DomainException.validation("providerMetadata must contain only JSON values");
  }
}
