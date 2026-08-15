package reengineering.ddd.evidence.api.representation;

import java.net.URI;
import org.springframework.hateoas.Link;
import org.springframework.hateoas.RepresentationModel;

public abstract class EvidenceModel<T extends EvidenceModel<T>> extends RepresentationModel<T> {
  protected final void addSelf(URI uri) {
    add(Link.of(uri.getPath()).withSelfRel());
  }

  protected final void addRelation(URI uri, String relation) {
    add(Link.of(uri.getPath(), relation));
  }
}
