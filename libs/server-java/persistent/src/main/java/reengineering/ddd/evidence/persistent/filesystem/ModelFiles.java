package reengineering.ddd.evidence.persistent.filesystem;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.fasterxml.jackson.dataformat.yaml.YAMLGenerator;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import reengineering.ddd.evidence.domain.DomainException;

final class ModelFiles {
  private static final ObjectMapper YAML =
      new ObjectMapper(
              YAMLFactory.builder().disable(YAMLGenerator.Feature.WRITE_DOC_START_MARKER).build())
          .setSerializationInclusion(JsonInclude.Include.NON_NULL);
  private static final TypeReference<LinkedHashMap<String, Object>> YAML_RECORD =
      new TypeReference<>() {};

  private ModelFiles() {}

  static List<Path> listYamlFiles(Path directory) {
    if (!Files.exists(directory)) return List.of();
    try (Stream<Path> entries = Files.list(directory)) {
      return entries
          .filter(Files::isRegularFile)
          .filter(ModelFiles::isYaml)
          .sorted(Comparator.comparing(Path::toString))
          .toList();
    } catch (IOException error) {
      throw DomainException.internal(
          "read Evidence model directory " + directory + ": " + error.getMessage());
    }
  }

  static Map<String, Object> readYaml(Path path, String resource) {
    try {
      Map<String, Object> document = YAML.readValue(path.toFile(), YAML_RECORD);
      if (document == null) {
        throw DomainException.validation(
            "invalid " + resource + " yaml " + path + ": the YAML document must be an object");
      }
      return document;
    } catch (DomainException error) {
      throw error;
    } catch (JsonProcessingException error) {
      throw DomainException.validation(
          "invalid " + resource + " yaml " + path + ": " + error.getOriginalMessage());
    } catch (IOException error) {
      throw DomainException.internal(
          "read " + resource + " file " + path + ": " + error.getMessage());
    }
  }

  static String requiredString(
      Map<String, Object> document, String key, Path path, String resource) {
    String value = optionalString(document.get(key));
    if (value == null) {
      throw DomainException.validation(
          resource + " file " + path + " is missing required field " + key);
    }
    return value;
  }

  static String optionalString(Object value) {
    if (!(value instanceof String text)) return null;
    String normalized = text.trim();
    return normalized.isEmpty() ? null : normalized;
  }

  static Instant timestamp(Path path) {
    try {
      return Files.getLastModifiedTime(path).toInstant().truncatedTo(ChronoUnit.MILLIS);
    } catch (IOException ignored) {
      return Instant.EPOCH;
    }
  }

  static void writeNewYaml(Path path, Map<String, Object> document, String resource) {
    writeYaml(path, document, resource, false);
  }

  static void replaceYaml(Path path, Map<String, Object> document, String resource) {
    writeYaml(path, document, resource, true);
  }

  static void delete(Path path, String resource) {
    try {
      Files.delete(path);
    } catch (IOException error) {
      throw DomainException.internal(
          "delete " + resource + " file " + path + ": " + error.getMessage());
    }
  }

  private static void writeYaml(
      Path path, Map<String, Object> document, String resource, boolean replace) {
    Path temporary = null;
    try {
      Files.createDirectories(path.getParent());
      temporary =
          Files.createTempFile(
              path.getParent(), "." + path.getFileName() + ".", "." + UUID.randomUUID() + ".tmp");
      Files.writeString(temporary, YAML.writeValueAsString(document), StandardCharsets.UTF_8);
      move(temporary, path, replace);
    } catch (FileAlreadyExistsException error) {
      throw DomainException.conflict(resource + " file " + path + " already exists");
    } catch (IOException error) {
      throw DomainException.internal(
          "write " + resource + " file " + path + ": " + error.getMessage());
    } finally {
      if (temporary != null) {
        try {
          Files.deleteIfExists(temporary);
        } catch (IOException ignored) {
          // The target write already completed or raised the authoritative error.
        }
      }
    }
  }

  private static void move(Path source, Path target, boolean replace) throws IOException {
    try {
      if (replace) {
        Files.move(
            source, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      } else {
        Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
      }
    } catch (AtomicMoveNotSupportedException ignored) {
      if (replace) {
        Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
      } else {
        Files.move(source, target);
      }
    }
  }

  private static boolean isYaml(Path path) {
    String name = path.getFileName().toString().toLowerCase(java.util.Locale.ROOT);
    return name.endsWith(".yaml") || name.endsWith(".yml");
  }
}
