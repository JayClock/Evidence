package reengineering.ddd.evidence.persistent.typehandler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.LinkedHashMap;
import java.util.Map;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

@MappedTypes(Map.class)
public final class StringMapJsonHandler extends BaseTypeHandler<Map<String, String>> {
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
  private static final TypeReference<LinkedHashMap<String, String>> STRING_MAP =
      new TypeReference<>() {};

  @Override
  public void setNonNullParameter(
      PreparedStatement statement, int index, Map<String, String> parameter, JdbcType jdbcType)
      throws SQLException {
    try {
      statement.setObject(index, OBJECT_MAPPER.writeValueAsString(parameter), Types.OTHER);
    } catch (JsonProcessingException error) {
      throw new SQLException("Failed to serialize workspace metadata", error);
    }
  }

  @Override
  public Map<String, String> getNullableResult(ResultSet results, String columnName)
      throws SQLException {
    return parse(results.getString(columnName));
  }

  @Override
  public Map<String, String> getNullableResult(ResultSet results, int columnIndex)
      throws SQLException {
    return parse(results.getString(columnIndex));
  }

  @Override
  public Map<String, String> getNullableResult(CallableStatement statement, int columnIndex)
      throws SQLException {
    return parse(statement.getString(columnIndex));
  }

  private Map<String, String> parse(String json) throws SQLException {
    if (json == null || json.isBlank()) return Map.of();
    try {
      return OBJECT_MAPPER.readValue(json, STRING_MAP);
    } catch (JsonProcessingException error) {
      throw new SQLException("Failed to deserialize workspace metadata", error);
    }
  }
}
