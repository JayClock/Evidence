package reengineering.ddd.evidence.api.representation;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.ws.rs.core.UriInfo;
import java.util.List;
import reengineering.ddd.evidence.api.ApiTemplates;

public final class SidebarModel extends EvidenceModel<SidebarModel> {
  private static final String WORKSPACE = "/api/workspaces/{workspaceId}";
  private static final String INBOX_ITEMS = WORKSPACE + "/inbox-items";
  private static final String STORY_CANDIDATES = WORKSPACE + "/story-candidates";
  private static final String STORIES = WORKSPACE + "/stories";
  private static final String DIAGRAM = WORKSPACE + "/diagram";
  private static final String LOGICAL_ENTITIES = WORKSPACE + "/logical-entities";

  private static final List<Section> SECTIONS =
      List.of(
          new Section(
              "工作区",
              "workspace",
              true,
              List.of(resource("workspace-overview", "工作区总览", WORKSPACE, "home"))),
          new Section(
              "来源",
              "source",
              true,
              List.of(resource("inbox-items", "Inbox", INBOX_ITEMS, "inbox"))),
          new Section(
              "交付",
              "delivery",
              true,
              List.of(
                  resource("story-candidates", "故事候选", STORY_CANDIDATES, "list-checks"),
                  resource("stories", "故事看板", STORIES, "columns"),
                  resource("tasking-queue", "交付计划", STORIES + "?filter=tasking", "list-todo"),
                  resource("pair-queue", "Pair 工作台", STORIES + "?filter=pair", "terminal"))),
          new Section(
              "模型",
              "model",
              true,
              List.of(
                  resource("diagram", "模型图", DIAGRAM, "workflow"),
                  resource("logical-entities", "逻辑实体", LOGICAL_ENTITIES, "database"))));

  @JsonProperty private final List<Section> sections;

  public SidebarModel(String userId, UriInfo uriInfo) {
    sections = SECTIONS;
    addSelf(ApiTemplates.userSidebar(uriInfo, userId));
    addRelation(ApiTemplates.user(uriInfo, userId), "user");
  }

  private static Item resource(String key, String label, String href, String icon) {
    return new Item(key, label, "resource", href, href, icon);
  }

  public record Section(String title, String key, boolean defaultOpen, List<Item> items) {}

  public record Item(
      String key, String label, String type, String href, String path, String icon) {}
}
