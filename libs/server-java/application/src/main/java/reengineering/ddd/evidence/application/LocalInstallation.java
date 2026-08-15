package reengineering.ddd.evidence.application;

public interface LocalInstallation {
  void initialize(Description description);

  record Description(String userId, String userName, String userEmail) {}
}
