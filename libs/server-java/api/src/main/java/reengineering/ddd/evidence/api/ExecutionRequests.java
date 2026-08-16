package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import reengineering.ddd.evidence.domain.DomainException;
import reengineering.ddd.evidence.domain.model.Pair;
import reengineering.ddd.evidence.domain.model.Respond;
import reengineering.ddd.evidence.domain.model.Showcase;

final class ExecutionRequests {
  private ExecutionRequests() {}

  static Pair.ActionAuthority pairAuthority(JsonNode body, String leaseToken) {
    object(body);
    return new Pair.ActionAuthority(
        text(body.get("pairRunId"), "pairRunId"),
        text(body.get("actionId"), "actionId"),
        positive(body.get("expectedPairVersion"), "expectedPairVersion"),
        leaseToken);
  }

  static Pair.DriverAttemptInput driver(JsonNode body, String leaseToken) {
    return new Pair.DriverAttemptInput(
        pairAuthority(body, leaseToken),
        text(body.get("role"), "role"),
        text(body.get("mode"), "mode"),
        text(body.get("summary"), "summary"),
        strings(body.get("changedPaths"), "changedPaths"),
        text(body.get("beforeWorktreeSha256"), "beforeWorktreeSha256"),
        text(body.get("afterWorktreeSha256"), "afterWorktreeSha256"),
        text(body.get("diffSha256"), "diffSha256"),
        nonnegative(body.get("agentCallCount"), "agentCallCount"),
        optionalNonnegative(body.get("inputTokens"), "inputTokens"),
        optionalNonnegative(body.get("outputTokens"), "outputTokens"));
  }

  static Pair.CommandObservationInput command(JsonNode body, String leaseToken) {
    return new Pair.CommandObservationInput(
        pairAuthority(body, leaseToken),
        text(body.get("stage"), "stage"),
        text(body.get("command"), "command"),
        text(body.get("termination"), "termination"),
        nullableInteger(body.get("exitCode"), "exitCode"),
        optional(body.get("signal"), "signal"),
        nonnegative(body.get("durationMs"), "durationMs"),
        text(body.get("stdoutSha256"), "stdoutSha256"),
        nonnegative(body.get("stdoutBytes"), "stdoutBytes"),
        nonnegative(body.get("stdoutLines"), "stdoutLines"),
        text(body.get("stderrSha256"), "stderrSha256"),
        nonnegative(body.get("stderrBytes"), "stderrBytes"),
        nonnegative(body.get("stderrLines"), "stderrLines"),
        text(body.get("worktreeSha256"), "worktreeSha256"),
        text(body.get("diffSha256"), "diffSha256"));
  }

  static Showcase.Q2ObservationInput q2(JsonNode body) {
    object(body);
    return new Showcase.Q2ObservationInput(
        text(body.get("showcaseRunId"), "showcaseRunId"),
        text(body.get("actionId"), "actionId"),
        positive(body.get("expectedShowcaseVersion"), "expectedShowcaseVersion"),
        text(body.get("command"), "command"),
        text(body.get("termination"), "termination"),
        nullableInteger(body.get("exitCode"), "exitCode"),
        optional(body.get("signal"), "signal"),
        nonnegative(body.get("durationMs"), "durationMs"),
        text(body.get("stdoutSha256"), "stdoutSha256"),
        nonnegative(body.get("stdoutBytes"), "stdoutBytes"),
        nonnegative(body.get("stdoutLines"), "stdoutLines"),
        text(body.get("stderrSha256"), "stderrSha256"),
        nonnegative(body.get("stderrBytes"), "stderrBytes"),
        nonnegative(body.get("stderrLines"), "stderrLines"),
        text(body.get("approvedCommitSha"), "approvedCommitSha"),
        text(body.get("worktreeSha256"), "worktreeSha256"));
  }

  static List<Respond.Promotion> promotions(JsonNode value) {
    if (value == null || !value.isArray()) {
      throw DomainException.validation("promotions must be an array");
    }
    List<Respond.Promotion> result = new ArrayList<>();
    for (int index = 0; index < value.size(); index++) {
      JsonNode promotion = value.get(index);
      if (!promotion.isObject()) {
        throw DomainException.validation("promotions[" + index + "] must be an object");
      }
      result.add(
          new Respond.Promotion(
              text(promotion.get("sourceRef"), "promotions[" + index + "].sourceRef"),
              text(promotion.get("kind"), "promotions[" + index + "].kind"),
              text(promotion.get("decision"), "promotions[" + index + "].decision"),
              text(promotion.get("reason"), "promotions[" + index + "].reason"),
              strings(
                  promotion.get("validationEvidenceRefs"),
                  "promotions[" + index + "].validationEvidenceRefs"),
              optional(
                  promotion.get("canonicalTarget"), "promotions[" + index + "].canonicalTarget")));
    }
    return result;
  }

  static Respond.NextProbe probe(JsonNode value) {
    if (value == null || !value.isObject()) {
      throw DomainException.validation("nextProbe must be an object");
    }
    return new Respond.NextProbe(
        text(value.get("question"), "nextProbe.question"),
        text(value.get("whyNow"), "nextProbe.whyNow"),
        strings(value.get("evidenceRefs"), "nextProbe.evidenceRefs"),
        text(value.get("firstAction"), "nextProbe.firstAction"));
  }

  static void object(JsonNode body) {
    InboxRequests.requireObject(body, "request body is required");
  }

  static String text(JsonNode value, String name) {
    return InboxRequests.requiredString(value, name, false);
  }

  static String optional(JsonNode value, String name) {
    return InboxRequests.optionalString(value, name);
  }

  static List<String> strings(JsonNode value, String name) {
    return InboxRequests.stringArray(value, name);
  }

  static int positive(JsonNode value, String name) {
    return InboxRequests.positiveInteger(value, name);
  }

  static int nonnegative(JsonNode value, String name) {
    if (value == null
        || !value.isIntegralNumber()
        || !value.canConvertToInt()
        || value.asInt() < 0) {
      throw DomainException.validation(name + " must be a non-negative integer");
    }
    return value.asInt();
  }

  static Integer optionalNonnegative(JsonNode value, String name) {
    if (value == null || value.isNull()) return null;
    return nonnegative(value, name);
  }

  static Integer nullableInteger(JsonNode value, String name) {
    if (value == null || value.isNull()) return null;
    if (!value.isIntegralNumber() || !value.canConvertToInt()) {
      throw DomainException.validation(name + " must be an integer or null");
    }
    return value.asInt();
  }
}
