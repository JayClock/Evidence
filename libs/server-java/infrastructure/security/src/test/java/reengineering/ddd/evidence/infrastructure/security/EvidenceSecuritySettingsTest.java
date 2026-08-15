package reengineering.ddd.evidence.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class EvidenceSecuritySettingsTest {
  @Test
  void defaultsToLocalLoopbackAuthentication() {
    MockEnvironment environment =
        new MockEnvironment()
            .withProperty("evidence.auth-mode", " ")
            .withProperty("evidence.user-id", " ");
    EvidenceSecuritySettings settings = EvidenceSecuritySettings.from(environment);

    assertThat(settings.authMode()).isEqualTo(EvidenceSecuritySettings.AuthenticationMode.LOCAL);
    assertThat(settings.userId()).isEqualTo("desktop-user");
    assertThat(settings.expectedAuthorization()).isNull();
    assertThat(settings.corsOrigins())
        .containsExactly("http://localhost:4200", "http://127.0.0.1:4200", "evidence://app");
  }

  @Test
  void requiresAuthorizationWhenLocalServerIsRemote() {
    MockEnvironment environment = new MockEnvironment().withProperty("server.address", "0.0.0.0");

    assertThatThrownBy(() -> EvidenceSecuritySettings.from(environment))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("EVIDENCE_API_AUTHORIZATION is required");
  }

  @Test
  void validatesLocalIdentityAndOidcEndpoints() {
    MockEnvironment invalidUser =
        new MockEnvironment().withProperty("evidence.user-id", "../other-user");
    assertThatThrownBy(() -> EvidenceSecuritySettings.from(invalidUser))
        .hasMessageContaining("unsupported characters");

    MockEnvironment insecureOidc =
        new MockEnvironment()
            .withProperty("evidence.auth-mode", "oidc")
            .withProperty("evidence.oidc.issuer", "http://identity.example.com")
            .withProperty("evidence.oidc.audience", "evidence-api");
    assertThatThrownBy(() -> EvidenceSecuritySettings.from(insecureOidc))
        .hasMessageContaining("must use HTTPS");
  }
}
