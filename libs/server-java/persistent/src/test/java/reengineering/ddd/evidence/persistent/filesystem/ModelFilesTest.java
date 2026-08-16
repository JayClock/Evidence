package reengineering.ddd.evidence.persistent.filesystem;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ModelFilesTest {
  @Test
  void truncatesFileTimestampsToMilliseconds(@TempDir Path directory) throws Exception {
    Path modelRoot = Files.createDirectory(directory.resolve(".evidence"));
    Files.setLastModifiedTime(
        modelRoot, FileTime.from(Instant.parse("2026-08-16T00:46:11.782558575Z")));
    Instant storedTimestamp = Files.getLastModifiedTime(modelRoot).toInstant();

    assertThat(ModelFiles.timestamp(modelRoot))
        .isEqualTo(storedTimestamp.truncatedTo(ChronoUnit.MILLIS));
  }
}
