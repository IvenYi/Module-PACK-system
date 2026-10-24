package com.zencas.edhr.identity.scope;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zencas.edhr.compliance.entity.AuditEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Objects;

@Service
@RequiredArgsConstructor
public class PackAuditAccessService {
    private final PackScopeService scope;
    private final ObjectMapper mapper;

    public boolean canRead(AuditEvent event) {
        if (!Objects.equals(scope.tenantKey(),event.getTenantId())) return false;
        if (scope.isTenantAdmin()) return true;
        Long factoryId = factoryId(event.getContentAfter());
        if (factoryId == null) factoryId = factoryId(event.getContentBefore());
        if (factoryId != null) return scope.factoryIds().contains(factoryId);
        return Objects.equals(scope.actorId(),event.getOperatorId()) || ("USER_ACCOUNT".equals(event.getEntityType()) && Objects.equals(scope.actorId(),event.getEntityId()));
    }

    private Long factoryId(String content) {
        if (content == null || content.isBlank()) return null;
        try {
            var data = mapper.readTree(content);
            var value = data.hasNonNull("siteId") ? data.path("siteId") : data.path("factoryId");
            return value.isMissingNode() || value.isNull() ? null : Long.valueOf(value.asText());
        } catch (Exception ex) { return null; }
    }
}
