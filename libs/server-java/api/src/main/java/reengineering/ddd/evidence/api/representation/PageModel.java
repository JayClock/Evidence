package reengineering.ddd.evidence.api.representation;

public record PageModel(int number, int size, int totalElements, int totalPages) {
  public static PageModel of(int page, int pageSize, int totalElements) {
    int totalPages = totalElements == 0 ? 0 : (int) Math.ceil((double) totalElements / pageSize);
    return new PageModel(page, pageSize, totalElements, totalPages);
  }
}
