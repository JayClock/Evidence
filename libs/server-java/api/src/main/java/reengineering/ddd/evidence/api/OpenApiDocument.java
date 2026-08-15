package reengineering.ddd.evidence.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.IOException;
import java.io.InputStream;
import org.springframework.stereotype.Component;

@Component
public class OpenApiDocument {
  private static final String RESOURCE = "/openapi/evidence-openapi.yaml";

  private final JsonNode document;

  public OpenApiDocument() {
    try (InputStream input = OpenApiDocument.class.getResourceAsStream(RESOURCE)) {
      if (input == null) {
        throw new IllegalStateException("OpenAPI resource is missing: " + RESOURCE);
      }
      document = new ObjectMapper(new YAMLFactory()).readTree(input);
    } catch (IOException error) {
      throw new IllegalStateException("Could not load the Evidence OpenAPI document", error);
    }
  }

  public JsonNode get() {
    return document;
  }
}
