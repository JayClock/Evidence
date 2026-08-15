package reengineering.ddd.evidence.config;

import org.glassfish.jersey.server.ResourceConfig;
import org.springframework.context.annotation.Configuration;
import reengineering.ddd.evidence.api.RootApi;

@Configuration
public class Jersey extends ResourceConfig {
  public Jersey() {
    register(RootApi.class);
  }
}
