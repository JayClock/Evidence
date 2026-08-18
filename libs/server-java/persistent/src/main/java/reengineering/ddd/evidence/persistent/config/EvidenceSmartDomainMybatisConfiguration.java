package reengineering.ddd.evidence.persistent.config;

import io.github.jayclock.smartdomain.boot.EnableSmartDomainMybatis;
import org.springframework.context.annotation.Configuration;
import reengineering.ddd.evidence.domain.model.Membership;
import reengineering.ddd.evidence.domain.model.User;

@Configuration
@EnableSmartDomainMybatis(
    associationBasePackages = "reengineering.ddd.evidence.persistent.associations",
    leafEntityTypes = {User.class, Membership.class})
public class EvidenceSmartDomainMybatisConfiguration {}
