package reengineering.ddd.evidence.infrastructure.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoders;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import reengineering.ddd.evidence.application.WorkspaceService;

@Configuration
public class SecurityConfig {
  @Bean
  EvidenceSecuritySettings evidenceSecuritySettings(Environment environment) {
    return EvidenceSecuritySettings.from(environment);
  }

  @Bean
  ApiAuthenticationEntryPoint apiAuthenticationEntryPoint(ObjectMapper objectMapper) {
    return new ApiAuthenticationEntryPoint(objectMapper);
  }

  @Bean
  SecurityFilterChain securityFilterChain(
      HttpSecurity http,
      EvidenceSecuritySettings settings,
      ApiAuthenticationEntryPoint authenticationEntryPoint,
      WorkspaceService workspaceService)
      throws Exception {
    http.csrf(AbstractHttpConfigurer::disable)
        .cors(cors -> cors.configurationSource(corsConfigurationSource(settings)))
        .sessionManagement(
            sessions -> sessions.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            requests ->
                requests
                    .requestMatchers(HttpMethod.OPTIONS, "/**")
                    .permitAll()
                    .requestMatchers("/health")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .exceptionHandling(errors -> errors.authenticationEntryPoint(authenticationEntryPoint));

    if (settings.authMode() == EvidenceSecuritySettings.AuthenticationMode.LOCAL) {
      http.addFilterBefore(
          new LocalAuthorizationFilter(settings, authenticationEntryPoint),
          AnonymousAuthenticationFilter.class);
    } else {
      http.oauth2ResourceServer(
          resourceServer ->
              resourceServer
                  .authenticationEntryPoint(authenticationEntryPoint)
                  .jwt(jwt -> jwt.decoder(jwtDecoder(settings))));
      http.addFilterAfter(
          new OidcUserProvisioningFilter(settings, workspaceService, authenticationEntryPoint),
          BearerTokenAuthenticationFilter.class);
    }
    return http.build();
  }

  private static CorsConfigurationSource corsConfigurationSource(
      EvidenceSecuritySettings settings) {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOrigins(settings.corsOrigins());
    configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("*"));
    configuration.setAllowCredentials(false);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }

  private static NimbusJwtDecoder jwtDecoder(EvidenceSecuritySettings settings) {
    NimbusJwtDecoder decoder =
        settings.oidcJwksUri() == null
            ? JwtDecoders.fromIssuerLocation(settings.oidcIssuer())
            : NimbusJwtDecoder.withJwkSetUri(settings.oidcJwksUri()).build();
    OAuth2TokenValidator<Jwt> issuer = JwtValidators.createDefaultWithIssuer(settings.oidcIssuer());
    decoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            issuer, new AudienceValidator(settings.oidcAudience())));
    return decoder;
  }

  private record AudienceValidator(String audience) implements OAuth2TokenValidator<Jwt> {
    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
      if (token.getAudience().contains(audience)) {
        return OAuth2TokenValidatorResult.success();
      }
      return OAuth2TokenValidatorResult.failure(
          new OAuth2Error("invalid_token", "The required audience is missing.", null));
    }
  }
}
