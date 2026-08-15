package reengineering.ddd.evidence.domain.model;

import io.github.jayclock.smartdomain.core.Entity;
import io.github.jayclock.smartdomain.core.HasMany;
import reengineering.ddd.evidence.domain.description.MemberDescription;
import reengineering.ddd.evidence.domain.description.WorkspaceDescription;

public class Workspace implements Entity<String, WorkspaceDescription> {
  private String identity;
  private WorkspaceDescription description;
  private Members members;

  public Workspace(String identity, WorkspaceDescription description, Members members) {
    this.identity = identity;
    this.description = description;
    this.members = members;
  }

  private Workspace() {}

  @Override
  public String getIdentity() {
    return identity;
  }

  @Override
  public WorkspaceDescription getDescription() {
    return description;
  }

  public HasMany<String, Member> members() {
    return members;
  }

  public Member addMember(MemberDescription description) {
    return members.add(description);
  }

  public Member updateMember(String memberId, String role) {
    return members.update(memberId, role);
  }

  public void removeMember(String memberId) {
    members.remove(memberId);
  }

  public interface Members extends HasMany<String, Member> {
    Member add(MemberDescription description);

    Member update(String memberId, String role);

    void remove(String memberId);
  }
}
