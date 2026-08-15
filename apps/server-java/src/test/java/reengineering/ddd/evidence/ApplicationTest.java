package reengineering.ddd.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
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
import reengineering.ddd.evidence.domain.model.User;
import reengineering.ddd.evidence.domain.model.Users;

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
  void exposesTheLocalUserAndDefaultWorkspaceMembership() throws Exception {
    ResponseEntity<String> user = authorized(HttpMethod.GET, "/api/users/java-user", null);
    assertThat(user.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertContentType(user, "application/vnd.evidence.user+json");
    JsonNode userBody = objectMapper.readTree(user.getBody());
    assertThat(userBody.path("id").asText()).isEqualTo("java-user");
    assertThat(userBody.path("name").asText()).isEqualTo("Desktop User");
    assertThat(userBody.path("_links").path("memberships").path("href").asText())
        .isEqualTo("/api/users/java-user/memberships");

    ResponseEntity<String> memberships =
        authorized(HttpMethod.GET, "/api/users/java-user/memberships?page=1&pageSize=20", null);
    assertThat(memberships.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertContentType(memberships, "application/vnd.evidence.memberships+json");
    JsonNode body = objectMapper.readTree(memberships.getBody());
    assertThat(body.path("page").path("number").asInt()).isEqualTo(1);
    JsonNode defaultMembership = null;
    for (JsonNode membership : body.path("_embedded").path("memberships")) {
      if ("default-workspace".equals(membership.path("workspace").path("id").asText())) {
        defaultMembership = membership;
        break;
      }
    }
    assertThat(defaultMembership).isNotNull();
    assertThat(Objects.requireNonNull(defaultMembership).path("role").asText()).isEqualTo("owner");
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

    ResponseEntity<String> members =
        authorized(HttpMethod.GET, "/api/workspaces/" + workspaceId + "/members", null);
    assertThat(members.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertContentType(members, "application/vnd.evidence.members+json");
    JsonNode membersBody = objectMapper.readTree(members.getBody());
    JsonNode owner = membersBody.path("_embedded").path("members").get(0);
    assertThat(owner.path("role").asText()).isEqualTo("owner");
    assertThat(owner.path("user").path("id").asText()).isEqualTo("java-user");

    ResponseEntity<String> duplicate =
        authorized(
            HttpMethod.POST,
            "/api/workspaces/" + workspaceId + "/members",
            "{\"user\":{\"id\":\"java-user\"},\"role\":\"member\"}");
    assertThat(duplicate.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);

    String memberPath = "/api/workspaces/" + workspaceId + "/members/" + owner.path("id").asText();
    assertThat(authorized(HttpMethod.PATCH, memberPath, "{\"role\":\"member\"}").getStatusCode())
        .isEqualTo(HttpStatus.CONFLICT);
    assertThat(authorized(HttpMethod.DELETE, memberPath, null).getStatusCode())
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

  private ResponseEntity<String> authorized(HttpMethod method, String path, String body) {
    HttpHeaders headers = new HttpHeaders();
    headers.set("Authorization", "Bearer java-skeleton-test");
    if (body != null) headers.setContentType(MediaType.APPLICATION_JSON);
    return restTemplate.exchange(url(path), method, new HttpEntity<>(body, headers), String.class);
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
