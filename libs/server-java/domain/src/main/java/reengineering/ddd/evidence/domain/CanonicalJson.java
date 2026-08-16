package reengineering.ddd.evidence.domain;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.RecordComponent;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Language-neutral canonical JSON used by persisted Evidence authority hashes. */
public final class CanonicalJson {
  private static final java.time.format.DateTimeFormatter MILLIS_INSTANT =
      new DateTimeFormatterBuilder().appendInstant(3).toFormatter();

  private CanonicalJson() {}

  public static String hash(Object value) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256")
              .digest(stringify(value).getBytes(StandardCharsets.UTF_8));
      return "sha256:" + java.util.HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 is unavailable", error);
    }
  }

  public static String stringify(Object value) {
    StringBuilder json = new StringBuilder();
    append(json, value);
    return json.toString();
  }

  public static String instant(Instant value) {
    return MILLIS_INSTANT.format(value);
  }

  public static Map<String, Object> normalizeObject(Map<String, ?> value, String label) {
    LinkedHashMap<String, Object> normalized = new LinkedHashMap<>();
    value.entrySet().stream()
        .sorted(Map.Entry.comparingByKey(Comparator.naturalOrder()))
        .forEach(
            entry ->
                normalized.put(
                    entry.getKey(),
                    normalizeValue(entry.getValue(), label + "." + entry.getKey())));
    return java.util.Collections.unmodifiableMap(normalized);
  }

  private static Object normalizeValue(Object value, String label) {
    if (value == null || value instanceof String || value instanceof Boolean) return value;
    if (value instanceof Number number) {
      if ((number instanceof Double doubleValue && !Double.isFinite(doubleValue))
          || (number instanceof Float floatValue && !Float.isFinite(floatValue))) {
        throw DomainException.validation("Inbox " + label + " must contain only JSON values");
      }
      return number;
    }
    if (value instanceof Map<?, ?> map) {
      LinkedHashMap<String, Object> object = new LinkedHashMap<>();
      for (Map.Entry<?, ?> entry : map.entrySet()) {
        if (!(entry.getKey() instanceof String key)) {
          throw DomainException.validation("Inbox " + label + " must contain only JSON values");
        }
        object.put(key, entry.getValue());
      }
      return normalizeObject(object, label);
    }
    if (value instanceof List<?> list) {
      List<Object> normalized = new ArrayList<>();
      for (int index = 0; index < list.size(); index++) {
        normalized.add(normalizeValue(list.get(index), label + "[" + index + "]"));
      }
      return java.util.Collections.unmodifiableList(normalized);
    }
    throw DomainException.validation("Inbox " + label + " must contain only JSON values");
  }

  private static void append(StringBuilder json, Object value) {
    if (value == null) {
      json.append("null");
    } else if (value instanceof String text) {
      appendString(json, text);
    } else if (value instanceof Boolean bool) {
      json.append(bool);
    } else if (value instanceof Number number) {
      json.append(number(number));
    } else if (value instanceof Map<?, ?> map) {
      appendObject(json, map);
    } else if (value instanceof Iterable<?> iterable) {
      appendArray(json, iterable);
    } else if (value instanceof Record record) {
      appendObject(json, recordValues(record));
    } else if (value instanceof Enum<?> enumeration) {
      appendString(json, enumeration.name());
    } else {
      throw new IllegalArgumentException("Unsupported canonical JSON value: " + value.getClass());
    }
  }

  private static Map<String, Object> recordValues(Record record) {
    LinkedHashMap<String, Object> values = new LinkedHashMap<>();
    try {
      for (RecordComponent component : record.getClass().getRecordComponents()) {
        values.put(component.getName(), component.getAccessor().invoke(record));
      }
      return values;
    } catch (IllegalAccessException | InvocationTargetException error) {
      throw new IllegalArgumentException(
          "Could not read canonical JSON record " + record.getClass().getName(), error);
    }
  }

  private static void appendObject(StringBuilder json, Map<?, ?> map) {
    List<Map.Entry<String, Object>> entries = new ArrayList<>();
    for (Map.Entry<?, ?> entry : map.entrySet()) {
      if (!(entry.getKey() instanceof String key)) {
        throw new IllegalArgumentException("Canonical JSON object keys must be strings");
      }
      entries.add(new java.util.AbstractMap.SimpleImmutableEntry<>(key, entry.getValue()));
    }
    entries.sort(Map.Entry.comparingByKey());
    json.append('{');
    for (int index = 0; index < entries.size(); index++) {
      if (index > 0) json.append(',');
      Map.Entry<String, Object> entry = entries.get(index);
      appendString(json, entry.getKey());
      json.append(':');
      append(json, entry.getValue());
    }
    json.append('}');
  }

  private static void appendArray(StringBuilder json, Iterable<?> values) {
    json.append('[');
    boolean first = true;
    for (Object value : values) {
      if (!first) json.append(',');
      append(json, value);
      first = false;
    }
    json.append(']');
  }

  private static void appendString(StringBuilder json, String value) {
    json.append('"');
    for (int index = 0; index < value.length(); index++) {
      char character = value.charAt(index);
      switch (character) {
        case '"' -> json.append("\\\"");
        case '\\' -> json.append("\\\\");
        case '\b' -> json.append("\\b");
        case '\f' -> json.append("\\f");
        case '\n' -> json.append("\\n");
        case '\r' -> json.append("\\r");
        case '\t' -> json.append("\\t");
        default -> {
          if (character < 0x20
              || (Character.isSurrogate(character)
                  && !(Character.isHighSurrogate(character)
                      && index + 1 < value.length()
                      && Character.isLowSurrogate(value.charAt(index + 1))))) {
            json.append(String.format("\\u%04x", (int) character));
          } else {
            json.append(character);
            if (Character.isHighSurrogate(character)) json.append(value.charAt(++index));
          }
        }
      }
    }
    json.append('"');
  }

  private static String number(Number value) {
    BigDecimal decimal;
    if (value instanceof BigDecimal exact) {
      decimal = exact;
    } else if (value instanceof BigInteger integer) {
      decimal = new BigDecimal(integer);
    } else if (value instanceof Byte
        || value instanceof Short
        || value instanceof Integer
        || value instanceof Long) {
      decimal = BigDecimal.valueOf(value.longValue());
    } else {
      double floating = value.doubleValue();
      if (!Double.isFinite(floating)) {
        throw new IllegalArgumentException("Canonical JSON numbers must be finite");
      }
      if (floating == 0d) return "0";
      decimal = BigDecimal.valueOf(floating);
    }

    if (decimal.signum() == 0) return "0";
    BigDecimal normalized = decimal.stripTrailingZeros();
    int exponent = normalized.precision() - normalized.scale() - 1;
    if (exponent >= 21 || exponent <= -7) {
      String digits = normalized.unscaledValue().abs().toString();
      StringBuilder scientific = new StringBuilder();
      if (normalized.signum() < 0) scientific.append('-');
      scientific.append(digits.charAt(0));
      if (digits.length() > 1) scientific.append('.').append(digits.substring(1));
      scientific.append('e');
      if (exponent >= 0) scientific.append('+');
      return scientific.append(exponent).toString();
    }
    return normalized.toPlainString();
  }
}
