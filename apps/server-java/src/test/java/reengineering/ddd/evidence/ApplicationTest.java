package reengineering.ddd.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import reengineering.ddd.evidence.application.WorkspaceService;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;
import reengineering.ddd.evidence.domain.model.User;
import reengineering.ddd.evidence.domain.model.Users;
import reengineering.ddd.evidence.domain.model.Workspace;

@Testcontainers
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "evidence.auth-mode=local",
      "evidence.api-authorization=Bearer java-skeleton-test",
      "evidence.user-id=java-user"
    })
class ApplicationTest {
  private static final Path TEST_ROOT = temporaryDirectory();

  @Container
  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:17-alpine")
          .withDatabaseName("evidence")
          .withUsername("evidence")
          .withPassword("evidence");

  @LocalServerPort private int port;

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private WorkspaceService workspaceService;

  @DynamicPropertySource
  static void databaseProperties(DynamicPropertyRegistry registry) {
    registry.add("evidence.database-url", POSTGRES::getJdbcUrl);
    registry.add("evidence.database-username", POSTGRES::getUsername);
    registry.add("evidence.database-password", POSTGRES::getPassword);
    registry.add(
        "evidence.default-workspace-path", () -> TEST_ROOT.resolve("default-workspace").toString());
    registry.add(
        "evidence.workspace-storage-root", () -> TEST_ROOT.resolve("workspace-models").toString());
  }

  @AfterAll
  static void removeTemporaryFiles() throws IOException {
    try (var paths = Files.walk(TEST_ROOT)) {
      paths.sorted(java.util.Comparator.reverseOrder()).forEach(ApplicationTest::delete);
    }
  }

  @Test
  void exposesPublicHealthResource() throws Exception {
    ResponseEntity<String> response = restTemplate.getForEntity(url("/health"), String.class);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(Objects.requireNonNull(response.getHeaders().getContentType()).toString())
        .startsWith("application/vnd.evidence.health+json");
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("_links").path("self").path("href").asText()).isEqualTo("/health");
    assertThat(body.path("status").asText()).isEqualTo("ok");
    assertThat(body.path("service").asText()).isEqualTo("evidence-server");
  }

  @Test
  void protectsAndExposesRootResource() throws Exception {
    ResponseEntity<String> unauthorized = restTemplate.getForEntity(url("/api"), String.class);
    assertThat(unauthorized.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    JsonNode unauthorizedBody = objectMapper.readTree(unauthorized.getBody());
    assertThat(unauthorizedBody.path("message").asText())
        .isEqualTo("Evidence API authentication failed.");

    ResponseEntity<String> response = authorized(HttpMethod.GET, "/api", null);
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(Objects.requireNonNull(response.getHeaders().getContentType()).toString())
        .startsWith("application/vnd.evidence.root+json");
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("_links").path("self").path("href").asText()).isEqualTo("/api");
    assertThat(body.path("_links").path("health").path("href").asText()).isEqualTo("/health");
    assertThat(body.path("_links").path("current-user").path("href").asText())
        .isEqualTo("/api/users/java-user");
  }

  @Test
  void servesTheContractOpenApiDocument() throws Exception {
    ResponseEntity<String> response = authorized(HttpMethod.GET, "/api/openapi.json", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("openapi").asText()).isEqualTo("3.1.0");
    assertThat(body.path("paths").has("/api/workspaces")).isTrue();
    assertThat(body.path("security").get(0).has("evidenceAuthorization")).isTrue();
  }

  @Test
  void exposesTheLocalUserSidebarAndDefaultWorkspaceMembership() throws Exception {
    ResponseEntity<String> user = authorized(HttpMethod.GET, "/api/users/java-user", null);
    assertThat(user.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertContentType(user, "application/vnd.evidence.user+json");
    JsonNode userBody = objectMapper.readTree(user.getBody());
    assertThat(userBody.path("id").asText()).isEqualTo("java-user");
    assertThat(userBody.path("name").asText()).isEqualTo("Desktop User");
    assertThat(userBody.path("_links").path("memberships").path("href").asText())
        .isEqualTo("/api/users/java-user/memberships");
    assertThat(userBody.path("_links").path("sidebar").path("href").asText())
        .isEqualTo("/api/users/java-user/sidebar");

    ResponseEntity<String> sidebar =
        authorized(HttpMethod.GET, "/api/users/java-user/sidebar", null);
    assertThat(sidebar.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertContentType(sidebar, "application/vnd.evidence.sidebar+json");
    JsonNode sidebarBody = objectMapper.readTree(sidebar.getBody());
    assertThat(sidebarBody.path("_links").path("self").path("href").asText())
        .isEqualTo("/api/users/java-user/sidebar");
    assertThat(sidebarBody.path("_links").path("user").path("href").asText())
        .isEqualTo("/api/users/java-user");
    JsonNode sections = sidebarBody.path("sections");
    assertThat(sections.size()).isEqualTo(4);
    assertThat(sections.get(0).path("key").asText()).isEqualTo("workspace");
    assertThat(sections.get(0).path("items").get(0).path("href").asText())
        .isEqualTo("/api/workspaces/{workspaceId}");
    assertThat(sections.get(1).path("key").asText()).isEqualTo("source");
    assertThat(sections.get(1).path("items").get(0).path("key").asText()).isEqualTo("inbox-items");
    assertThat(sections.get(2).path("key").asText()).isEqualTo("delivery");
    assertThat(sections.get(2).path("items").get(2).path("href").asText())
        .isEqualTo("/api/workspaces/{workspaceId}/stories?filter=tasking");
    assertThat(sections.get(2).path("items").get(3).path("href").asText())
        .isEqualTo("/api/workspaces/{workspaceId}/stories?filter=pair");
    assertThat(sections.get(3).path("key").asText()).isEqualTo("model");
    assertThat(sections.get(3).path("items").get(1).path("key").asText())
        .isEqualTo("logical-entities");

    ResponseEntity<String> memberships =
        authorized(HttpMethod.GET, "/api/users/java-user/memberships?page=1&pageSize=20", null);
    assertThat(memberships.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertContentType(memberships, "application/vnd.evidence.memberships+json");
    JsonNode body = objectMapper.readTree(memberships.getBody());
    assertThat(body.path("page").path("number").asInt()).isEqualTo(1);
    JsonNode defaultMembership = null;
    for (JsonNode membership : body.path("_embedded").path("memberships")) {
      if ("/api/workspaces/default-workspace"
          .equals(membership.path("_links").path("workspace").path("href").asText())) {
        defaultMembership = membership;
        break;
      }
    }
    assertThat(defaultMembership).isNotNull();
    assertThat(Objects.requireNonNull(defaultMembership).has("workspace")).isFalse();
    assertThat(defaultMembership.path("role").asText()).isEqualTo("owner");
  }

  @Test
  void provisionsAnExternalIdentityIdempotently() {
    Users.ExternalIdentity identity =
        new Users.ExternalIdentity(
            "https://identity.example.test", "subject-1", "OIDC User", "oidc@example.test");

    User created = workspaceService.resolveExternalIdentity(identity, true).orElseThrow();
    User replayed = workspaceService.resolveExternalIdentity(identity, true).orElseThrow();

    assertThat(replayed.getIdentity()).isEqualTo(created.getIdentity());
    assertThat(replayed.getDescription().name()).isEqualTo("OIDC User");
  }

  @Test
  void listsOnlyWorkspacesAccessibleToTheAuthenticatedUser() throws Exception {
    User otherUser =
        workspaceService
            .resolveExternalIdentity(
                new Users.ExternalIdentity(
                    "https://identity.example.test",
                    "workspace-list-other-user",
                    "Other User",
                    "other@example.test"),
                true)
            .orElseThrow();
    Workspace inaccessible =
        workspaceService.createWorkspace(
            otherUser.getIdentity(),
            new WorkspaceDescription(
                "Other User Workspace", null, "active", Map.of(), Instant.EPOCH, Instant.EPOCH));

    ResponseEntity<String> listed =
        authorized(HttpMethod.GET, "/api/workspaces?page=1&pageSize=100", null);
    assertThat(listed.getStatusCode()).isEqualTo(HttpStatus.OK);
    JsonNode listedWorkspaces =
        objectMapper.readTree(listed.getBody()).path("_embedded").path("workspaces");
    for (JsonNode workspace : listedWorkspaces) {
      assertThat(workspace.path("id").asText()).isNotEqualTo(inaccessible.getIdentity());
    }
    assertThat(
            authorized(HttpMethod.GET, "/api/workspaces/" + inaccessible.getIdentity(), null)
                .getStatusCode())
        .isEqualTo(HttpStatus.NOT_FOUND);
  }

  @Test
  void createsUpdatesAndSoftDeletesAWorkspaceWithItsModelRoot() throws Exception {
    ResponseEntity<String> created =
        authorized(
            HttpMethod.POST,
            "/api/workspaces",
            """
            {
              "title":" Java Workspace ",
              "description":"Workspace vertical slice",
              "metadata":{"source":"java-test"}
            }
            """);
    assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertContentType(created, "application/vnd.evidence.workspace+json");
    JsonNode createdBody = objectMapper.readTree(created.getBody());
    String workspaceId = createdBody.path("id").asText();
    assertThat(created.getHeaders().getFirst(HttpHeaders.LOCATION))
        .isEqualTo("/api/workspaces/" + workspaceId);
    assertThat(createdBody.path("title").asText()).isEqualTo("Java Workspace");
    assertThat(createdBody.path("metadata").path("source").asText()).isEqualTo("java-test");
    assertThat(
            Files.isDirectory(
                TEST_ROOT
                    .resolve("workspace-models")
                    .resolve(workspaceId)
                    .resolve(".evidence/entities")))
        .isTrue();
    assertThat(
            Files.isDirectory(
                TEST_ROOT
                    .resolve("workspace-models")
                    .resolve(workspaceId)
                    .resolve(".evidence/associations")))
        .isTrue();

    ResponseEntity<String> memberships =
        authorized(HttpMethod.GET, "/api/workspaces/" + workspaceId + "/memberships", null);
    assertThat(memberships.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertContentType(memberships, "application/vnd.evidence.memberships+json");
    JsonNode membershipsBody = objectMapper.readTree(memberships.getBody());
    JsonNode owner = membershipsBody.path("_embedded").path("memberships").get(0);
    assertThat(owner.path("role").asText()).isEqualTo("owner");
    assertThat(owner.path("user").path("id").asText()).isEqualTo("java-user");

    ResponseEntity<String> duplicate =
        authorized(
            HttpMethod.POST,
            "/api/workspaces/" + workspaceId + "/memberships",
            "{\"user\":{\"id\":\"java-user\"},\"role\":\"member\"}");
    assertThat(duplicate.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);

    String membershipPath =
        "/api/workspaces/" + workspaceId + "/memberships/" + owner.path("id").asText();
    assertThat(
            authorized(HttpMethod.PATCH, membershipPath, "{\"role\":\"member\"}").getStatusCode())
        .isEqualTo(HttpStatus.CONFLICT);
    assertThat(authorized(HttpMethod.DELETE, membershipPath, null).getStatusCode())
        .isEqualTo(HttpStatus.CONFLICT);

    ResponseEntity<String> updated =
        authorized(
            HttpMethod.PUT,
            "/api/workspaces/" + workspaceId,
            """
            {"title":"Updated Java Workspace","status":"active","metadata":{"updated":"true"}}
            """);
    assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
    JsonNode updatedBody = objectMapper.readTree(updated.getBody());
    assertThat(updatedBody.path("title").asText()).isEqualTo("Updated Java Workspace");
    assertThat(updatedBody.path("metadata").path("updated").asText()).isEqualTo("true");

    ResponseEntity<String> deleted =
        authorized(HttpMethod.DELETE, "/api/workspaces/" + workspaceId, null);
    assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    assertThat(deleted.getHeaders().getContentType()).isNull();
    assertThat(authorized(HttpMethod.GET, "/api/workspaces/" + workspaceId, null).getStatusCode())
        .isEqualTo(HttpStatus.NOT_FOUND);
  }

  @Test
  void persistsAndProjectsWorkspaceModelFiles() throws Exception {
    ResponseEntity<String> createdWorkspace =
        authorized(
            HttpMethod.POST, "/api/workspaces", "{\"title\":\"Java Filesystem Model Workspace\"}");
    String workspaceId = objectMapper.readTree(createdWorkspace.getBody()).path("id").asText();
    String workspacePath = "/api/workspaces/" + workspaceId;

    ResponseEntity<String> diagram = authorized(HttpMethod.GET, workspacePath + "/diagram", null);
    assertThat(diagram.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertContentType(diagram, "application/vnd.evidence.diagram+json");
    JsonNode diagramBody = objectMapper.readTree(diagram.getBody());
    assertThat(diagramBody.path("id").asText()).isEqualTo("model");
    assertThat(diagramBody.path("_links").path("nodes").path("href").asText())
        .isEqualTo(workspacePath + "/diagram/nodes");

    JsonNode source =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    workspacePath + "/logical-entities",
                    """
                    {
                      "type":"EVIDENCE",
                      "subType":"EVIDENCE:other_evidence",
                      "name":"Order Evidence",
                      "label":"Order",
                      "description":"Source evidence",
                      "attributes":[]
                    }
                    """)
                .getBody());
    JsonNode target =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    workspacePath + "/logical-entities",
                    """
                    {
                      "type":"PARTICIPANT",
                      "subType":"PARTICIPANT:party",
                      "name":"Customer",
                      "attributes":[]
                    }
                    """)
                .getBody());
    String sourceId = source.path("id").asText();
    String targetId = target.path("id").asText();
    assertThat(source.path("subType").asText()).isEqualTo("EVIDENCE:other_evidence");
    assertThat(
            Files.isRegularFile(
                TEST_ROOT
                    .resolve("workspace-models")
                    .resolve(workspaceId)
                    .resolve(".evidence/entities")
                    .resolve(sourceId + ".yaml")))
        .isTrue();

    ResponseEntity<String> listedEntities =
        authorized(HttpMethod.GET, workspacePath + "/logical-entities?page=1&pageSize=50", null);
    assertContentType(listedEntities, "application/vnd.evidence.logical-entities+json");
    JsonNode entitiesBody = objectMapper.readTree(listedEntities.getBody());
    assertThat(entitiesBody.path("page").path("totalElements").asInt()).isEqualTo(2);
    assertThat(entitiesBody.path("_embedded").path("logicalEntities").size()).isEqualTo(2);

    ResponseEntity<String> updatedEntity =
        authorized(
            HttpMethod.PUT,
            workspacePath + "/logical-entities/" + sourceId,
            "{\"label\":\"Submitted Order\"}");
    assertThat(updatedEntity.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertContentType(updatedEntity, "application/vnd.evidence.logical-entity+json");
    assertThat(objectMapper.readTree(updatedEntity.getBody()).path("label").asText())
        .isEqualTo("Submitted Order");

    ResponseEntity<String> nodes =
        authorized(HttpMethod.GET, workspacePath + "/diagram/nodes", null);
    assertContentType(nodes, "application/vnd.evidence.nodes+json");
    JsonNode projectedNode =
        findById(objectMapper.readTree(nodes.getBody()).path("_embedded").path("nodes"), sourceId);
    assertThat(projectedNode.path("_embedded").path("logical-entity").path("id").asText())
        .isEqualTo(sourceId);
    ResponseEntity<String> node =
        authorized(HttpMethod.GET, workspacePath + "/diagram/nodes/" + sourceId, null);
    assertContentType(node, "application/vnd.evidence.node+json");

    ResponseEntity<String> invalidRelationship =
        authorized(
            HttpMethod.POST,
            workspacePath + "/logical-relationships",
            "{\"source\":{\"id\":\"" + sourceId + "\"},\"target\":{\"id\":\"missing\"}}");
    assertThat(invalidRelationship.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

    ResponseEntity<String> createdRelationship =
        authorized(
            HttpMethod.POST,
            workspacePath + "/logical-relationships",
            "{\"source\":{\"id\":\""
                + sourceId
                + "\"},\"target\":{\"id\":\""
                + targetId
                + "\"},\"label\":\"belongs to\"}");
    assertThat(createdRelationship.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertContentType(createdRelationship, "application/vnd.evidence.logical-relationships+json");
    String relationshipId =
        objectMapper.readTree(createdRelationship.getBody()).path("id").asText();
    assertThat(
            Files.isRegularFile(
                TEST_ROOT
                    .resolve("workspace-models")
                    .resolve(workspaceId)
                    .resolve(".evidence/associations")
                    .resolve(relationshipId + ".yaml")))
        .isTrue();

    ResponseEntity<String> updatedRelationship =
        authorized(
            HttpMethod.PUT,
            workspacePath + "/logical-relationships/" + relationshipId,
            "{\"label\":\"submitted by\"}");
    assertContentType(updatedRelationship, "application/vnd.evidence.logical-relationship+json");
    assertThat(objectMapper.readTree(updatedRelationship.getBody()).path("label").asText())
        .isEqualTo("submitted by");

    ResponseEntity<String> edges =
        authorized(HttpMethod.GET, workspacePath + "/diagram/edges", null);
    assertContentType(edges, "application/vnd.evidence.edges+json");
    JsonNode projectedEdge =
        findById(
            objectMapper.readTree(edges.getBody()).path("_embedded").path("edges"), relationshipId);
    assertThat(projectedEdge.path("logicalRelationship").path("id").asText())
        .isEqualTo(relationshipId);
    ResponseEntity<String> edge =
        authorized(HttpMethod.GET, workspacePath + "/diagram/edges/" + relationshipId, null);
    assertContentType(edge, "application/vnd.evidence.edge+json");

    ResponseEntity<String> deletedRelationship =
        authorized(
            HttpMethod.DELETE, workspacePath + "/logical-relationships/" + relationshipId, null);
    assertThat(objectMapper.readTree(deletedRelationship.getBody()).path("deleted").asBoolean())
        .isTrue();
    ResponseEntity<String> deletedEntity =
        authorized(HttpMethod.DELETE, workspacePath + "/logical-entities/" + sourceId, null);
    assertThat(objectMapper.readTree(deletedEntity.getBody()).path("deleted").asBoolean()).isTrue();
  }

  @Test
  void capturesInboxEvidenceAndAdmitsOneCandidateIteration() throws Exception {
    JsonNode workspace =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    "/api/workspaces",
                    "{\"title\":\"Java Inbox Workflow Workspace\"}")
                .getBody());
    String workspaceId = workspace.path("id").asText();
    String workspacePath = "/api/workspaces/" + workspaceId;
    String inboxPath = workspacePath + "/inbox-items";
    String source =
        """
        {
          "sourceKind":"manual_text",
          "externalKey":"capture-1",
          "title":"Java Inbox migration",
          "body":"Preserve exact Inbox evidence.",
          "contentType":"text/markdown",
          "providerMetadata":{"channel":"product"}
        }
        """;

    ResponseEntity<String> capturedResponse = authorized(HttpMethod.POST, inboxPath, source);
    assertThat(capturedResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertContentType(capturedResponse, "application/vnd.evidence.inbox-item+json");
    JsonNode captured = objectMapper.readTree(capturedResponse.getBody());
    String itemId = captured.path("id").asText();
    String firstRevisionHash = captured.path("latestRevisionSha256").asText();
    assertThat(captured.path("revisionCount").asInt()).isEqualTo(1);

    JsonNode replayed =
        objectMapper.readTree(authorized(HttpMethod.POST, inboxPath, source).getBody());
    assertThat(replayed.path("id").asText()).isEqualTo(itemId);
    assertThat(replayed.path("revisionCount").asInt()).isEqualTo(1);
    JsonNode listedInbox =
        objectMapper.readTree(
            authorized(
                    HttpMethod.GET,
                    inboxPath
                        + "?page=1&pageSize=20&status=active&sourceKind=manual_text&q=Inbox+migration",
                    null)
                .getBody());
    assertThat(listedInbox.path("page").path("totalElements").asInt()).isEqualTo(1);
    assertThat(listedInbox.path("_links").path("self").path("href").asText())
        .isEqualTo(
            inboxPath
                + "?page=1&pageSize=20&status=active&sourceKind=manual_text&q=Inbox+migration");

    ResponseEntity<String> appendedResponse =
        authorized(
            HttpMethod.POST,
            inboxPath + "/" + itemId + "/revisions",
            """
            {
              "body":"Preserve exact Inbox evidence and candidate authority.",
              "uri":"https://example.com/issues/1",
              "providerMetadata":{"channel":"product","state":"open"},
              "sourceUpdatedAt":"2026-07-21T12:00:00.000Z",
              "expectedLatestRevisionSha256":"%s"
            }
            """
                .formatted(firstRevisionHash));
    assertThat(appendedResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertContentType(appendedResponse, "application/vnd.evidence.inbox-revision+json");
    JsonNode appended = objectMapper.readTree(appendedResponse.getBody());
    String revisionHash = appended.path("contentSha256").asText();
    assertThat(revisionHash).isNotEqualTo(firstRevisionHash);
    assertThat(appended.path("uri").asText()).isEqualTo("https://example.com/issues/1");
    assertThat(appended.path("sourceUpdatedAt").asText()).isEqualTo("2026-07-21T12:00:00.000Z");

    ResponseEntity<String> revisions =
        authorized(
            HttpMethod.GET, inboxPath + "/" + itemId + "/revisions?page=1&pageSize=20", null);
    assertContentType(revisions, "application/vnd.evidence.inbox-revisions+json");
    assertThat(
            objectMapper.readTree(revisions.getBody()).path("page").path("totalElements").asInt())
        .isEqualTo(2);

    String extractionsPath = workspacePath + "/inbox-extractions";
    ResponseEntity<String> extractionResponse =
        authorized(HttpMethod.POST, extractionsPath, "{\"inboxItemIds\":[\"" + itemId + "\"]}");
    assertThat(extractionResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertContentType(extractionResponse, "application/vnd.evidence.inbox-extraction+json");
    JsonNode extraction = objectMapper.readTree(extractionResponse.getBody());
    String extractionId = extraction.path("id").asText();
    assertThat(extraction.path("reference").asText()).isEqualTo("EXTRACT-0001");
    assertThat(extraction.path("sources").get(0).path("contentSha256").asText())
        .isEqualTo(revisionHash);
    assertThat(extractionResponse.getHeaders().getFirst(HttpHeaders.LOCATION))
        .isEqualTo(extractionsPath + "/" + extractionId);

    ResponseEntity<String> proposedResponse =
        authorized(
            HttpMethod.POST,
            extractionsPath + "/" + extractionId + "/candidates",
            """
            {
              "expectedVersion":1,
              "candidates":[
                {
                  "title":"Defer this candidate",
                  "problem":"The migration needs a bounded candidate.",
                  "role":"Workspace maintainer",
                  "goal":"Defer one alternative.",
                  "value":"Authority stays explicit.",
                  "cognitiveMode":"complicated",
                  "citations":[{"inboxItemId":"%s","revisionSha256":"%s","locator":"whole-source"}]
                },
                {
                  "title":"Select this candidate",
                  "problem":"The migration needs a bounded candidate.",
                  "role":"Workspace maintainer",
                  "goal":"Start one iteration.",
                  "value":"Authority stays traceable.",
                  "cognitiveMode":"complicated",
                  "citations":[{"inboxItemId":"%s","revisionSha256":"%s","locator":"whole-source"}]
                }
              ]
            }
            """
                .formatted(itemId, revisionHash, itemId, revisionHash));
    assertThat(proposedResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertContentType(proposedResponse, "application/vnd.evidence.inbox-candidate-set+json");
    JsonNode proposed = objectMapper.readTree(proposedResponse.getBody());
    assertThat(proposed.path("extraction").path("status").asText()).isEqualTo("completed");
    JsonNode candidates = proposed.path("_embedded").path("storyCandidates");
    assertThat(candidates).hasSize(2);
    JsonNode deferredCandidate = candidates.get(0);
    JsonNode selectedCandidate = candidates.get(1);

    String candidatesPath = workspacePath + "/story-candidates";
    ResponseEntity<String> deferredResponse =
        authorized(
            HttpMethod.POST,
            candidatesPath + "/" + deferredCandidate.path("id").asText() + "/defer",
            """
            {"candidateSha256":"%s","reason":"Not this alternative."}
            """
                .formatted(deferredCandidate.path("contentSha256").asText()));
    assertThat(deferredResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertContentType(deferredResponse, "application/vnd.evidence.story-candidate+json");
    assertThat(objectMapper.readTree(deferredResponse.getBody()).path("status").asText())
        .isEqualTo("deferred");

    ResponseEntity<String> selectedResponse =
        authorized(
            HttpMethod.POST,
            candidatesPath + "/" + selectedCandidate.path("id").asText() + "/select",
            """
            {"candidateSha256":"%s","baseCommitSha":"cccccccccccccccccccccccccccccccccccccccc"}
            """
                .formatted(selectedCandidate.path("contentSha256").asText()));
    assertThat(selectedResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertContentType(selectedResponse, "application/vnd.evidence.iteration+json");
    JsonNode iteration = objectMapper.readTree(selectedResponse.getBody());
    assertThat(iteration.path("lifecycle").asText()).isEqualTo("provisioning");
    assertThat(iteration.path("stage").asText()).isEqualTo("candidate_review");
    assertThat(iteration.path("activeStoryId").isNull()).isTrue();
    assertThat(selectedResponse.getHeaders().getFirst(HttpHeaders.LOCATION))
        .isEqualTo(workspacePath + "/iterations/" + iteration.path("id").asText());

    ResponseEntity<String> deferredList =
        authorized(
            HttpMethod.GET,
            candidatesPath + "?page=1&pageSize=20&status=deferred&extractionId=" + extractionId,
            null);
    assertContentType(deferredList, "application/vnd.evidence.story-candidates+json");
    JsonNode deferredListBody = objectMapper.readTree(deferredList.getBody());
    assertThat(deferredListBody.path("page").path("totalElements").asInt()).isEqualTo(1);
    assertThat(
            deferredListBody
                .path("_embedded")
                .path("storyCandidates")
                .get(0)
                .path("status")
                .asText())
        .isEqualTo("deferred");

    JsonNode selectedState =
        objectMapper.readTree(
            authorized(
                    HttpMethod.GET,
                    candidatesPath + "/" + selectedCandidate.path("id").asText(),
                    null)
                .getBody());
    assertThat(selectedState.path("status").asText()).isEqualTo("selected");
    assertThat(selectedState.path("_links").path("iteration").path("href").asText())
        .isEqualTo(workspacePath + "/iterations/" + iteration.path("id").asText());

    ResponseEntity<String> revertedResponse =
        authorized(
            HttpMethod.POST,
            inboxPath + "/" + itemId + "/revisions",
            """
            {
              "title":"Java Inbox migration",
              "body":"Preserve exact Inbox evidence.",
              "contentType":"text/markdown",
              "uri":null,
              "providerMetadata":{"channel":"product"},
              "sourceUpdatedAt":null,
              "expectedLatestRevisionSha256":"%s"
            }
            """
                .formatted(revisionHash));
    JsonNode reverted = objectMapper.readTree(revertedResponse.getBody());
    assertThat(reverted.path("id").asText()).isEqualTo(captured.path("latestRevisionId").asText());
    JsonNode revertedItem =
        objectMapper.readTree(authorized(HttpMethod.GET, inboxPath + "/" + itemId, null).getBody());
    assertThat(revertedItem.path("revisionCount").asInt()).isEqualTo(2);
    assertThat(revertedItem.path("version").asInt()).isEqualTo(3);

    JsonNode deferredItem =
        objectMapper.readTree(
            authorized(
                    HttpMethod.PATCH,
                    inboxPath + "/" + itemId,
                    "{\"status\":\"deferred\",\"expectedVersion\":3}")
                .getBody());
    assertThat(deferredItem.path("status").asText()).isEqualTo("deferred");
    assertThat(deferredItem.path("version").asInt()).isEqualTo(4);
    assertThat(
            authorized(
                    HttpMethod.PATCH,
                    inboxPath + "/" + itemId,
                    "{\"status\":\"closed\",\"expectedVersion\":3}")
                .getStatusCode())
        .isEqualTo(HttpStatus.CONFLICT);
  }

  @Test
  void confirmsKickoffUnderstandingAndTaskingAuthority() throws Exception {
    JsonNode workspace =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    "/api/workspaces",
                    "{\"title\":\"Java Iteration Workflow Workspace\"}")
                .getBody());
    String workspaceId = workspace.path("id").asText();
    String workspacePath = "/api/workspaces/" + workspaceId;
    JsonNode source =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    workspacePath + "/inbox-items",
                    """
                    {
                      "sourceKind":"manual_text",
                      "externalKey":"phase-six",
                      "title":"Approve one Java Tasking plan",
                      "body":"Preserve the complete Java workflow authority.",
                      "contentType":"text/markdown"
                    }
                    """)
                .getBody());
    JsonNode extraction =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    workspacePath + "/inbox-extractions",
                    "{\"inboxItemIds\":[\"" + source.path("id").asText() + "\"]}")
                .getBody());
    JsonNode candidates =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    workspacePath
                        + "/inbox-extractions/"
                        + extraction.path("id").asText()
                        + "/candidates",
                    """
                    {
                      "expectedVersion":1,
                      "candidates":[{
                        "title":"Approve one Java Tasking plan",
                        "problem":"Coding lacks explicit Java workflow authority.",
                        "role":"Delivery lead",
                        "goal":"Approve one complete Tasking plan.",
                        "value":"Pair starts only from reviewed authority.",
                        "cognitiveMode":"complicated",
                        "citations":[{
                          "inboxItemId":"%s",
                          "revisionSha256":"%s",
                          "locator":"whole-source"
                        }]
                      }]
                    }
                    """
                        .formatted(
                            source.path("id").asText(),
                            source.path("latestRevisionSha256").asText()))
                .getBody());
    JsonNode candidate = candidates.path("_embedded").path("storyCandidates").get(0);
    String baseCommitSha = "a".repeat(40);
    JsonNode selected =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    workspacePath
                        + "/story-candidates/"
                        + candidate.path("id").asText()
                        + "/select",
                    """
                    {"candidateSha256":"%s","baseCommitSha":"%s"}
                    """
                        .formatted(candidate.path("contentSha256").asText(), baseCommitSha))
                .getBody());
    String iterationId = selected.path("id").asText();
    String iterationPath = workspacePath + "/iterations/" + iterationId;

    ResponseEntity<String> intake = authorized(HttpMethod.GET, iterationPath + "/intake", null);
    assertContentType(intake, "application/vnd.evidence.iteration-intake+json");
    assertThat(
            objectMapper.readTree(intake.getBody()).path("candidate").path("candidateId").asText())
        .isEqualTo(candidate.path("id").asText());

    JsonNode provisioned =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    iterationPath + "/provisioning/complete",
                    """
                    {"expectedVersion":1,"baseCommitSha":"%s","branchName":"evidence/iter-%s"}
                    """
                        .formatted(baseCommitSha, iterationId))
                .getBody());
    assertThat(provisioned.path("version").asInt()).isEqualTo(2);

    JsonNode kickoff =
        objectMapper.readTree(
            authorized(HttpMethod.GET, iterationPath + "/kickoff", null).getBody());
    JsonNode proposal = kickoff.path("currentProposal");
    ResponseEntity<String> confirmedResponse =
        authorized(
            HttpMethod.POST,
            iterationPath + "/kickoff/decisions",
            """
            {
              "proposalId":"%s",
              "proposalSha256":"%s",
              "expectedIterationVersion":2,
              "action":"confirm"
            }
            """
                .formatted(proposal.path("id").asText(), proposal.path("contentSha256").asText()));
    assertContentType(confirmedResponse, "application/vnd.evidence.kickoff-decision-result+json");
    JsonNode confirmed = objectMapper.readTree(confirmedResponse.getBody());
    String storyId = confirmed.path("storyCard").path("storyId").asText();
    assertThat(confirmed.path("iteration").path("stage").asText()).isEqualTo("tqa");

    JsonNode story =
        objectMapper.readTree(
            authorized(HttpMethod.GET, workspacePath + "/stories/" + storyId, null).getBody());
    assertThat(story.path("authority").path("nextAction").asText())
        .isEqualTo("run_understanding_analyst");
    ResponseEntity<String> stories =
        authorized(HttpMethod.GET, workspacePath + "/stories?page=1&pageSize=20", null);
    assertContentType(stories, "application/vnd.evidence.stories+json");
    assertThat(
            objectMapper.readTree(stories.getBody()).path("summary").path("agentAttention").asInt())
        .isEqualTo(1);

    JsonNode understanding =
        objectMapper.readTree(
            authorized(HttpMethod.GET, iterationPath + "/understanding", null).getBody());
    JsonNode scenarioProposal =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    iterationPath + "/understanding/scenario-proposals",
                    """
                    {
                      "expectedIterationVersion":3,
                      "storyId":"%s",
                      "storyRevisionId":"%s",
                      "scenarios":[{
                        "title":"Review one complete Tasking Candidate",
                        "given":["A confirmed Story Revision is active."],
                        "when":"The delivery lead reviews the Tasking plan.",
                        "then":["A complete Tasking Candidate awaits human Desk Check."],
                        "businessData":["Story Revision v2","TASKING-001"]
                      }]
                    }
                    """
                        .formatted(
                            storyId, understanding.path("storyRevision").path("id").asText()))
                .getBody());
    JsonNode scenarioDecision =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    iterationPath + "/understanding/decisions",
                    """
                    {
                      "expectedIterationVersion":4,
                      "action":"confirm",
                      "proposalId":"%s",
                      "proposalSha256":"%s",
                      "selectedDraftIds":["%s"]
                    }
                    """
                        .formatted(
                            scenarioProposal.path("id").asText(),
                            scenarioProposal.path("contentSha256").asText(),
                            scenarioProposal.path("drafts").get(0).path("id").asText()))
                .getBody());
    JsonNode storyRevision = scenarioDecision.path("storyRevision");
    assertThat(storyRevision.path("revisionNumber").asInt()).isEqualTo(2);
    assertThat(scenarioDecision.path("iteration").path("stage").asText()).isEqualTo("modeling");

    JsonNode noModelImpact =
        objectMapper.readTree(
            authorized(
                    HttpMethod.POST,
                    iterationPath + "/tasking/no-model-impact",
                    """
                    {
                      "expectedIterationVersion":5,
                      "storyId":"%s",
                      "storyRevisionId":"%s",
                      "storyRevisionSha256":"%s",
                      "reason":"This Story changes only local workflow glue."
                    }
                    """
                        .formatted(
                            storyId,
                            storyRevision.path("id").asText(),
                            storyRevision.path("contentSha256").asText()))
                .getBody());
    assertThat(noModelImpact.path("modelChangeRequired").asBoolean()).isFalse();

    ResponseEntity<String> candidateResponse =
        authorized(
            HttpMethod.POST,
            iterationPath + "/tasking/candidates",
            """
            {
              "expectedIterationVersion":6,
              "storyId":"%s",
              "storyRevisionId":"%s",
              "noModelImpactDecisionId":"%s",
              "noModelImpactDecisionSha256":"%s",
              "projectCatalog":{"projects":[
                {"id":":server-java:domain","root":"libs/server-java/domain","targets":["build","spotlessCheck","test"]},
                {"id":":server-java:persistent","root":"libs/server-java/persistent","targets":["build","spotlessCheck","test"]},
                {"id":"@evidence/server","root":"apps/server-java","targets":["build","spotlessCheck","test"]}
              ]},
              "runtimes":[{
                "id":"RUNTIME-001","runtime":"java",
                "functionalContexts":["delivery"],"technicalBoundaries":["java-domain"],
                "projectIds":[":server-java:domain",":server-java:persistent","@evidence/server"]
              }],
              "tests":[
                {"id":"TEST-001","quadrant":"Q1","intent":"Domain authority.","runtimePlanId":"RUNTIME-001","stepId":"java-domain-q1","projectId":":server-java:domain","testFilter":"reengineering.ddd.evidence.domain.TaskingTest","supportedBy":[],"scenarioIds":["SC-001"],"businessData":["Story Revision v2"],"modelRefs":{"entities":[],"associations":[]}},
                {"id":"TEST-002","quadrant":"Q1","intent":"Persistence authority.","runtimePlanId":"RUNTIME-001","stepId":"java-persistent-q1","projectId":":server-java:persistent","testFilter":"reengineering.ddd.evidence.persistent.TaskingPersistenceTest","supportedBy":[],"scenarioIds":["SC-001"],"businessData":["TASKING-001"],"modelRefs":{"entities":[],"associations":[]}},
                {"id":"TEST-003","quadrant":"Q2","intent":"Desk Check authority.","runtimePlanId":"RUNTIME-001","stepId":"java-api-q2","projectId":"@evidence/server","testFilter":"reengineering.ddd.evidence.ApplicationTest","supportedBy":["TEST-001","TEST-002"],"scenarioIds":["SC-001"],"scenarioOutcome":"A complete Tasking Candidate awaits human Desk Check.","businessData":["TASKING-001"],"modelRefs":{"entities":[],"associations":[]}}
              ],
              "tasks":[{"id":"TASK-001","description":"Drive the authority chain.","testIds":["TEST-001","TEST-002","TEST-003"],"dependsOn":[]}]
            }
            """
                .formatted(
                    storyId,
                    storyRevision.path("id").asText(),
                    noModelImpact.path("id").asText(),
                    noModelImpact.path("contentSha256").asText()));
    assertThat(candidateResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertContentType(candidateResponse, "application/vnd.evidence.tasking-candidate+json");
    JsonNode taskingCandidate = objectMapper.readTree(candidateResponse.getBody());
    assertThat(taskingCandidate.path("tests").get(2).path("processId").asText())
        .isEqualTo("java-server-feature");

    ResponseEntity<String> approvedResponse =
        authorized(
            HttpMethod.POST,
            iterationPath + "/tasking/decisions",
            """
            {"expectedIterationVersion":7,"candidateId":"%s","candidateSha256":"%s","action":"approve"}
            """
                .formatted(
                    taskingCandidate.path("id").asText(),
                    taskingCandidate.path("contentSha256").asText()));
    assertContentType(approvedResponse, "application/vnd.evidence.desk-check-decision-result+json");
    JsonNode approved = objectMapper.readTree(approvedResponse.getBody());
    assertThat(approved.path("iteration").path("stage").asText()).isEqualTo("approved");
    assertThat(approved.path("approvedPlan").path("plan").path("planVersion").asInt()).isEqualTo(2);

    confirmsPairShowcaseAndRespond(workspacePath, iterationPath, storyId, approved);
  }

  private void confirmsPairShowcaseAndRespond(
      String workspacePath, String iterationPath, String storyId, JsonNode approved)
      throws Exception {
    String pairPath = iterationPath + "/pair";
    ResponseEntity<String> startResponse =
        authorized(
            HttpMethod.POST,
            pairPath + "/runs",
            """
            {
              "expectedIterationVersion":8,
              "approvedTaskingPlanId":"%s",
              "approvedTaskingPlanSha256":"%s",
              "executorId":"java-integration-test"
            }
            """
                .formatted(
                    approved.path("approvedPlan").path("id").asText(),
                    approved.path("approvedPlan").path("contentSha256").asText()));
    if (startResponse.getStatusCode() != HttpStatus.CREATED) {
      throw new AssertionError("Pair start failed: " + startResponse.getBody());
    }
    assertContentType(startResponse, "application/vnd.evidence.pair-start-result+json");
    JsonNode start = objectMapper.readTree(startResponse.getBody());
    JsonNode pair = start.path("pair");
    String leaseToken = start.path("leaseToken").asText();
    String worktreeSha256 = integrationSha(1);
    String diffSha256 = integrationSha(2);
    int evidenceSequence = 3;

    for (int step = 0; step < 100; step++) {
      JsonNode action = pair.path("nextAction");
      String kind = action.path("kind").asText();
      if ("await_human".equals(kind)) break;
      com.fasterxml.jackson.databind.node.ObjectNode body = objectMapper.createObjectNode();
      body.put("pairRunId", pair.path("run").path("id").asText());
      body.put("actionId", action.path("actionId").asText());
      body.put("expectedPairVersion", action.path("expectedPairVersion").asInt());
      String suffix;
      if ("run_driver".equals(kind)) {
        suffix = "/driver-attempts";
        String role = action.path("role").asText();
        body.put("role", role);
        body.put("mode", action.path("mode").asText());
        body.put("summary", "Java integration Driver completed.");
        var changedPaths = body.putArray("changedPaths");
        String before = worktreeSha256;
        if (!"refactor".equals(role)) {
          JsonNode roots =
              "test".equals(role)
                  ? action.path("allowedTestRoots")
                  : action.path("allowedProductionRoots");
          changedPaths.add(
              roots.get(0).asText()
                  + "/java-pair-integration-"
                  + evidenceSequence
                  + ("test".equals(role) ? ".spec.ts" : ".ts"));
          worktreeSha256 = integrationSha(evidenceSequence++);
          diffSha256 = integrationSha(evidenceSequence++);
        }
        body.put("beforeWorktreeSha256", before);
        body.put("afterWorktreeSha256", worktreeSha256);
        body.put("diffSha256", diffSha256);
        body.put("agentCallCount", 1);
        body.putNull("inputTokens");
        body.putNull("outputTokens");
      } else if ("execute_command".equals(kind)) {
        suffix = "/command-observations";
        String stage = action.path("stage").asText();
        body.put("stage", stage);
        body.put("command", action.path("command").asText());
        body.put("termination", "exited");
        body.put("exitCode", "red".equals(stage) ? 1 : 0);
        body.putNull("signal");
        body.put("durationMs", 25);
        body.put("stdoutSha256", integrationSha(evidenceSequence++));
        body.put("stdoutBytes", 16);
        body.put("stdoutLines", 1);
        body.put("stderrSha256", integrationSha(evidenceSequence++));
        body.put("stderrBytes", "red".equals(stage) ? 8 : 0);
        body.put("stderrLines", "red".equals(stage) ? 1 : 0);
        body.put("worktreeSha256", worktreeSha256);
        body.put("diffSha256", diffSha256);
      } else if ("review_red".equals(kind)) {
        suffix = "/red-reviews";
        body.put("observationId", action.path("observationId").asText());
        body.put("classification", "behavior");
        body.put("reason", "The approved behavior assertion was reached and failed.");
      } else {
        throw new AssertionError("Unexpected Pair action " + kind);
      }
      ResponseEntity<String> evidence =
          authorizedWithLease(HttpMethod.POST, pairPath + suffix, body.toString(), leaseToken);
      assertThat(evidence.getStatusCode()).isEqualTo(HttpStatus.CREATED);
      assertContentType(evidence, "application/vnd.evidence.pair-action-result+json");
      pair = objectMapper.readTree(evidence.getBody()).path("pair");
    }
    assertThat(pair.path("run").path("status").asText()).isEqualTo("approval_required");
    JsonNode manifest = pair.path("manifest");
    ResponseEntity<String> pairDecision =
        authorized(
            HttpMethod.POST,
            pairPath + "/decisions",
            """
            {
              "expectedPairVersion":%d,
              "action":"approve",
              "reason":"Reviewed the complete Java Story diff.",
              "manifestSha256":"%s",
              "diffSha256":"%s",
              "commitSha":"%s"
            }
            """
                .formatted(
                    pair.path("run").path("version").asInt(),
                    manifest.path("contentSha256").asText(),
                    manifest.path("finalDiffSha256").asText(),
                    "c".repeat(40)));
    assertThat(pairDecision.getStatusCode()).isEqualTo(HttpStatus.OK);
    pair = objectMapper.readTree(pairDecision.getBody()).path("pair");
    assertThat(pair.path("run").path("status").asText()).isEqualTo("approved");

    String showcasePath = iterationPath + "/showcase";
    ResponseEntity<String> showcaseResponse = authorized(HttpMethod.GET, showcasePath, null);
    assertContentType(showcaseResponse, "application/vnd.evidence.showcase+json");
    JsonNode showcase = objectMapper.readTree(showcaseResponse.getBody());
    JsonNode q2 = showcase.path("nextAction");
    ResponseEntity<String> q2Response =
        authorized(
            HttpMethod.POST,
            showcasePath + "/q2-observations",
            """
            {
              "showcaseRunId":"%s","actionId":"%s","expectedShowcaseVersion":%d,
              "command":"%s","termination":"exited","exitCode":0,"signal":null,
              "durationMs":25,"stdoutSha256":"%s","stdoutBytes":16,"stdoutLines":1,
              "stderrSha256":"%s","stderrBytes":0,"stderrLines":0,
              "approvedCommitSha":"%s","worktreeSha256":"%s"
            }
            """
                .formatted(
                    showcase.path("run").path("id").asText(),
                    q2.path("actionId").asText(),
                    q2.path("expectedShowcaseVersion").asInt(),
                    q2.path("command").asText().replace("\\", "\\\\").replace("\"", "\\\""),
                    integrationSha(evidenceSequence++),
                    integrationSha(evidenceSequence++),
                    "c".repeat(40),
                    worktreeSha256));
    assertThat(q2Response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    showcase = objectMapper.readTree(q2Response.getBody()).path("showcase");

    JsonNode observe = showcase.path("nextAction");
    ResponseEntity<String> productResponse =
        authorized(
            HttpMethod.POST,
            showcasePath + "/product-observations",
            """
            {
              "expectedShowcaseVersion":%d,"scenarioId":"%s",
              "observedOutcomes":["A complete Tasking Candidate awaits human Desk Check."],
              "observation":"The product surface preserves human authority.",
              "valueFeedback":"The confirmed Scenario value remains visible.",
              "evidenceRefs":["java:showcase-product-observation"]
            }
            """
                .formatted(
                    observe.path("expectedShowcaseVersion").asInt(),
                    observe.path("scenarioId").asText()));
    assertThat(productResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    showcase = objectMapper.readTree(productResponse.getBody()).path("showcase");

    for (String quadrant : java.util.List.of("Q3", "Q4")) {
      JsonNode risk = showcase.path("nextAction");
      assertThat(risk.path("quadrant").asText()).isEqualTo(quadrant);
      ResponseEntity<String> riskResponse =
          authorized(
              HttpMethod.POST,
              showcasePath + "/risk-decisions",
              """
              {
                "expectedShowcaseVersion":%d,"quadrant":"%s",
                "disposition":"not_required","activities":[],
                "reason":"No further %s activity is required for this Java slice."
              }
              """
                  .formatted(risk.path("expectedShowcaseVersion").asInt(), quadrant, quadrant));
      if (riskResponse.getStatusCode() != HttpStatus.CREATED) {
        throw new AssertionError("Showcase risk failed: " + riskResponse.getBody());
      }
      showcase = objectMapper.readTree(riskResponse.getBody()).path("showcase");
    }
    JsonNode reviewer = showcase.path("nextAction");
    assertThat(reviewer.path("kind").asText()).isEqualTo("run_reviewer");
    ResponseEntity<String> reviewResponse =
        authorized(
            HttpMethod.POST,
            showcasePath + "/reviews",
            """
            {
              "expectedShowcaseVersion":%d,"evidenceBundleSha256":"%s",
              "observedFacts":["Fresh Q2 and product evidence cover the Scenario."],
              "productDomainFeedback":[],"technicalQualityFeedback":[],
              "unresolvedAssumptions":[],"recommendation":"accept"
            }
            """
                .formatted(
                    reviewer.path("expectedShowcaseVersion").asInt(),
                    reviewer.path("evidenceBundleSha256").asText()));
    assertThat(reviewResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    showcase = objectMapper.readTree(reviewResponse.getBody()).path("showcase");
    JsonNode awaitHuman = showcase.path("nextAction");
    ResponseEntity<String> showcaseDecision =
        authorized(
            HttpMethod.POST,
            showcasePath + "/decisions",
            """
            {
              "expectedShowcaseVersion":%d,"action":"accept",
              "reason":"The domain expert accepts the observed value.",
              "evidenceBundleSha256":"%s","reviewSha256":"%s"
            }
            """
                .formatted(
                    awaitHuman.path("expectedShowcaseVersion").asInt(),
                    showcase.path("run").path("evidenceBundleSha256").asText(),
                    showcase.path("review").path("contentSha256").asText()));
    assertThat(showcaseDecision.getStatusCode()).isEqualTo(HttpStatus.OK);
    showcase = objectMapper.readTree(showcaseDecision.getBody()).path("showcase");
    assertThat(showcase.path("run").path("stage").asText()).isEqualTo("accepted");

    String respondPath = iterationPath + "/respond";
    ResponseEntity<String> respondResponse = authorized(HttpMethod.GET, respondPath, null);
    assertContentType(respondResponse, "application/vnd.evidence.respond+json");
    JsonNode respond = objectMapper.readTree(respondResponse.getBody());
    JsonNode learner = respond.path("nextAction");
    ResponseEntity<String> candidateResponse =
        authorized(
            HttpMethod.POST,
            respondPath + "/candidates",
            """
            {
              "actionId":"%s","expectedIterationVersion":%d,"authoritySha256":"%s",
              "promotions":[],"noPromotionReason":"No reusable knowledge exceeds existing authority.",
              "observedOutcomes":["The Scenario and value were accepted by a human."],
              "residualRisks":[],
              "nextProbe":{"question":"Which product risk should the next Story validate?",
                "whyNow":"The current Story is complete.","evidenceRefs":["showcase:accepted"],
                "firstAction":"A human decides whether to capture the Probe."}
            }
            """
                .formatted(
                    learner.path("actionId").asText(),
                    learner.path("expectedIterationVersion").asInt(),
                    learner.path("authoritySha256").asText()));
    assertThat(candidateResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertContentType(candidateResponse, "application/vnd.evidence.respond-action-result+json");
    respond = objectMapper.readTree(candidateResponse.getBody()).path("respond");
    JsonNode decision = respond.path("nextAction");
    ResponseEntity<String> respondDecision =
        authorized(
            HttpMethod.POST,
            respondPath + "/decisions",
            """
            {
              "expectedIterationVersion":%d,"candidateId":"%s",
              "candidateSha256":"%s","authoritySha256":"%s","action":"approve",
              "reason":"The domain expert approves the knowledge response and next Probe."
            }
            """
                .formatted(
                    decision.path("expectedIterationVersion").asInt(),
                    decision.path("candidateId").asText(),
                    decision.path("candidateSha256").asText(),
                    decision.path("authoritySha256").asText()));
    assertThat(respondDecision.getStatusCode()).isEqualTo(HttpStatus.OK);
    respond = objectMapper.readTree(respondDecision.getBody()).path("respond");
    assertThat(respond.path("iteration").path("stage").asText()).isEqualTo("accepted");
    assertThat(
            objectMapper
                .readTree(
                    authorized(HttpMethod.GET, workspacePath + "/stories/" + storyId, null)
                        .getBody())
                .path("authority")
                .path("nextAction")
                .asText())
        .isEqualTo("none");
  }

  @Test
  void rejectsDesktopRepositoryPathsInWorkspacePayloads() {
    ResponseEntity<String> directPath =
        authorized(
            HttpMethod.POST,
            "/api/workspaces",
            "{\"title\":\"Invalid\",\"path\":\"/desktop/repository\"}");
    assertThat(directPath.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

    ResponseEntity<String> metadataPath =
        authorized(
            HttpMethod.POST,
            "/api/workspaces",
            "{\"title\":\"Invalid\",\"metadata\":{\"repositoryRoot\":\"/desktop/repository\"}}");
    assertThat(metadataPath.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
  }

  private static JsonNode findById(JsonNode values, String id) {
    for (JsonNode value : values) {
      if (id.equals(value.path("id").asText())) return value;
    }
    throw new AssertionError("Resource " + id + " not found");
  }

  private ResponseEntity<String> authorized(HttpMethod method, String path, String body) {
    return authorized(method, path, body, null);
  }

  private ResponseEntity<String> authorizedWithLease(
      HttpMethod method, String path, String body, String leaseToken) {
    return authorized(method, path, body, leaseToken);
  }

  private ResponseEntity<String> authorized(
      HttpMethod method, String path, String body, String leaseToken) {
    HttpHeaders headers = new HttpHeaders();
    headers.set("Authorization", "Bearer java-skeleton-test");
    if (leaseToken != null) headers.set("X-Evidence-Pair-Lease", leaseToken);
    headers.setAccept(java.util.List.of(MediaType.parseMediaType("application/*+json")));
    if (body != null) headers.setContentType(MediaType.APPLICATION_JSON);
    return restTemplate.exchange(url(path), method, new HttpEntity<>(body, headers), String.class);
  }

  private static String integrationSha(int value) {
    return "sha256:" + String.format("%064x", value);
  }

  private static void assertContentType(ResponseEntity<String> response, String expected) {
    assertThat(Objects.requireNonNull(response.getHeaders().getContentType()).toString())
        .startsWith(expected);
  }

  private String url(String path) {
    return "http://127.0.0.1:" + port + path;
  }

  private static Path temporaryDirectory() {
    try {
      return Files.createTempDirectory("evidence-java-server-").toRealPath();
    } catch (IOException error) {
      throw new ExceptionInInitializerError(error);
    }
  }

  private static void delete(Path path) {
    try {
      Files.deleteIfExists(path);
    } catch (IOException error) {
      throw new IllegalStateException("Could not delete " + path, error);
    }
  }
}
