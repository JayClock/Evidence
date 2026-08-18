package reengineering.ddd.evidence.persistent.config;

import io.github.jayclock.smartdomain.boot.EnableSmartDomainMybatis;
import org.springframework.context.annotation.Configuration;
import reengineering.ddd.evidence.domain.model.Membership;

@Configuration
@EnableSmartDomainMybatis(
    associationBasePackages = "reengineering.ddd.evidence.persistent.associations",
    leafEntityTypes = Membership.class)
public class EvidenceSmartDomainMybatisConfiguration {}
