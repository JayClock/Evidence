package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Ref;
import java.util.List;

/** Authoritative Story and immutable Story Revision projections. */
public final class Delivery {
  private Delivery() {}

  public record Authority(String owner, String nextAction) {}

  public record Citation(
      Ref<String> inboxItem,
      Ref<String> inboxRevision,
      int inboxRevisionNumber,
      String contentSha256,
      String locator) {}

  public record Scenario(
      String id,
      String reference,
      String sourceDraftId,
      String title,
      List<String> given,
      String when,
      List<String> then,
      List<String> businessData) {
    public Scenario {
      given = List.copyOf(given);
      then = List.copyOf(then);
      businessData = List.copyOf(businessData);
    }
  }

  public record StageCount(String loop, String stage, int count) {}

  public record ActionCount(String action, int count) {}

  public record PortfolioSummary(
      int humanAttention,
      int agentAttention,
      int approved,
      List<StageCount> stages,
      List<ActionCount> actions) {
    public PortfolioSummary {
      stages = List.copyOf(stages);
      actions = List.copyOf(actions);
    }
  }

  public record Page<E>(List<E> items, int total) {
    public Page {
      items = List.copyOf(items);
    }
  }

  public interface Association {
    Page<Story> listStories(int page, int pageSize);

    PortfolioSummary summarizeStories();

    java.util.Optional<Story> findStory(String storyId);
  }

  public static Authority authority(
      String lifecycle, String loop, String stage, boolean hasPendingClarification) {
    if (!"active".equals(lifecycle)) return new Authority("none", "none");
    if ("understand".equals(loop)) {
      if ("tqa".equals(stage)) {
        return hasPendingClarification
            ? new Authority("human", "answer_clarification")
            : new Authority("agent", "run_understanding_analyst");
      }
      if ("scenario_review".equals(stage)) {
        return new Authority("human", "review_scenario_set");
      }
      if ("modeling".equals(stage)) return new Authority("human", "record_model_impact");
    }
    if ("tasking".equals(loop)) {
      if ("drafting".equals(stage) || "knowledge_gap".equals(stage)) {
        return new Authority("agent", "run_tasking_analyst");
      }
      if ("desk_check".equals(stage)) {
        return new Authority("human", "review_tasking_candidate");
      }
      if ("approved".equals(stage)) return new Authority("human", "start_pair");
    }
    if ("pair".equals(loop)) {
      if ("quality_gate_failed".equals(stage) || "exception".equals(stage)) {
        return new Authority("human", "route_pair_exception");
      }
      if ("quality_gates_passed".equals(stage)) {
        return new Authority("human", "review_pair_change");
      }
      if ("approved".equals(stage)) return new Authority("none", "none");
      return new Authority("agent", "run_pair");
    }
    if ("showcase".equals(loop)) {
      if ("setup".equals(stage)) return new Authority("human", "record_showcase_evidence");
      if ("reviewing".equals(stage)) return new Authority("agent", "review_showcase");
      if ("decision".equals(stage)) return new Authority("human", "decide_showcase");
      return new Authority("none", "none");
    }
    if ("respond".equals(loop)) {
      if ("drafting".equals(stage)) return new Authority("agent", "run_respond_learner");
      if ("decision".equals(stage)) {
        return new Authority("human", "review_respond_candidate");
      }
    }
    return new Authority("none", "none");
  }
}
