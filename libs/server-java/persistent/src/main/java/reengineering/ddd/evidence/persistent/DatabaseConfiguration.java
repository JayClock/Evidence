package reengineering.ddd.evidence.persistent;

import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import javax.sql.DataSource;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
@MapperScan("reengineering.ddd.evidence.persistent")
public class DatabaseConfiguration {
  @Bean
  DataSource dataSource(Environment environment) {
    DatabaseUrl database =
        DatabaseUrl.parse(
            environment.getProperty(
                "evidence.database-url", "postgresql://postgres:postgres@localhost:5432/evidence"));
    HikariDataSource dataSource = new HikariDataSource();
    dataSource.setJdbcUrl(database.jdbcUrl());
    dataSource.setUsername(
        valueOrDefault(environment.getProperty("evidence.database-username"), database.username()));
    dataSource.setPassword(
        valueOrDefault(environment.getProperty("evidence.database-password"), database.password()));
    dataSource.setConnectionInitSql("SET TIME ZONE 'UTC'");
    return dataSource;
  }

  @Bean
  Clock evidenceClock() {
    return Clock.systemUTC();
  }

  private static String valueOrDefault(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }

  private record DatabaseUrl(String jdbcUrl, String username, String password) {
    private static DatabaseUrl parse(String value) {
      String normalized = value == null ? "" : value.trim();
      if (normalized.startsWith("jdbc:postgresql:")) {
        return new DatabaseUrl(normalized, "postgres", "postgres");
      }

      URI uri;
      try {
        uri = URI.create(normalized);
      } catch (IllegalArgumentException error) {
        throw new IllegalStateException("DATABASE_URL must be a PostgreSQL URL.", error);
      }
      if (!("postgres".equals(uri.getScheme()) || "postgresql".equals(uri.getScheme()))
          || uri.getHost() == null) {
        throw new IllegalStateException("DATABASE_URL must be a PostgreSQL URL.");
      }
      String userInfo = uri.getRawUserInfo();
      String username = "postgres";
      String password = "postgres";
      if (userInfo != null) {
        String[] parts = userInfo.split(":", 2);
        username = decode(parts[0]);
        password = parts.length > 1 ? decode(parts[1]) : "";
      }
      String host = uri.getHost().contains(":") ? "[" + uri.getHost() + "]" : uri.getHost();
      String port = uri.getPort() < 0 ? "" : ":" + uri.getPort();
      String query = uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery();
      return new DatabaseUrl(
          "jdbc:postgresql://" + host + port + uri.getRawPath() + query, username, password);
    }

    private static String decode(String value) {
      return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
  }
}
