package reengineering.ddd.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Objects;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "evidence.auth-mode=local",
      "evidence.api-authorization=Bearer java-skeleton-test",
      "evidence.user-id=java-user"
    })
class ApplicationTest {
  @LocalServerPort private int port;

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;

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

    ResponseEntity<String> response = authorizedGet("/api");
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
    ResponseEntity<String> response = authorizedGet("/api/openapi.json");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("openapi").asText()).isEqualTo("3.1.0");
    assertThat(body.path("paths").has("/api/workspaces")).isTrue();
    assertThat(body.path("security").get(0).has("evidenceAuthorization")).isTrue();
  }

  private ResponseEntity<String> authorizedGet(String path) {
    HttpHeaders headers = new HttpHeaders();
    headers.set("Authorization", "Bearer java-skeleton-test");
    return restTemplate.exchange(
        url(path), HttpMethod.GET, new HttpEntity<>(headers), String.class);
  }

  private String url(String path) {
    return "http://127.0.0.1:" + port + path;
  }
}
