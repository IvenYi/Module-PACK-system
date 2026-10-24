package com.zencas.edhr.identity.scope;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class PackScopeService {
    private final JdbcTemplate jdbc;
    private final PackIdentityService identities;

    public PackIdentityService.Identity current() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) throw denied();
        try {
            return identities.findActive(Long.valueOf(authentication.getName())).orElseThrow(PackScopeService::denied);
        } catch (NumberFormatException ex) {
            throw denied();
        }
    }

    public Long tenantId() { return current().tenantId(); }
    public String tenantKey() { return current().tenantKey(); }
    public String actorId() { return current().userId().toString(); }
    public String actorType() { return current().actorType(); }
    public boolean isTenantAdmin() { return current().builtinAdmin(); }
    public String tenantCodeForUser(Long userId) { return identities.findActive(userId).orElseThrow(PackScopeService::denied).tenantKey(); }
    public String tenantKeyForId(Long tenantId) {
        if (Long.valueOf(1L).equals(tenantId)) return "default";
        return jdbc.query("SELECT code FROM tenant WHERE id=? AND status='ACTIVE'",(rs,row) -> rs.getString(1),tenantId)
                .stream().findFirst().orElseThrow(PackScopeService::denied);
    }
    public Long resolveTenant(String tenantCode) {
        return jdbc.query("SELECT id FROM tenant WHERE code=? AND status='ACTIVE'",(rs,row) -> rs.getLong(1),tenantCode)
                .stream().findFirst().orElseThrow(PackScopeService::denied);
    }

    public boolean hasAllFactories() {
        var identity = current();
        return identity.builtinAdmin() || Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT COUNT(*) > 0 FROM pack_role_scope s JOIN role r ON r.id=s.role_id
                JOIN user_role ur ON ur.role_id=r.id WHERE ur.user_id=? AND r.tenant_id=? AND s.factory_mode='ALL'
                """, Boolean.class, identity.userId(), identity.tenantId()));
    }

    public Set<Long> factoryIds() {
        return factoryIdsForUser(current().userId());
    }

    public Set<Long> factoryIdsForUser(Long userId) {
        var identity = identities.findActive(userId).orElseThrow(PackScopeService::denied);
        boolean all = identity.builtinAdmin() || Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT COUNT(*)>0 FROM pack_role_scope s JOIN role r ON r.id=s.role_id JOIN user_role ur ON ur.role_id=r.id
                WHERE ur.user_id=? AND r.tenant_id=? AND s.factory_mode='ALL'
                """, Boolean.class, identity.userId(), identity.tenantId()));
        if (all) return new LinkedHashSet<>(jdbc.queryForList(
                "SELECT id FROM site WHERE tenant_id=? AND status='ACTIVE' ORDER BY id", Long.class, identity.tenantId()));
        return new LinkedHashSet<>(jdbc.queryForList("""
                SELECT DISTINCT f.id FROM site f JOIN pack_role_factory rf ON rf.factory_id=f.id
                JOIN role r ON r.id=rf.role_id JOIN user_role ur ON ur.role_id=r.id
                JOIN pack_role_scope rs ON rs.role_id=r.id
                WHERE ur.user_id=? AND r.tenant_id=? AND f.tenant_id=? AND f.status='ACTIVE' AND rs.factory_mode='SELECTED'
                ORDER BY f.id
                """, Long.class, identity.userId(), identity.tenantId(), identity.tenantId()));
    }

    public void requireFactory(Long factoryId) {
        if (factoryId == null) throw denied();
        var identity = current();
        if (identity.builtinAdmin() && Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT COUNT(*) > 0 FROM site WHERE id=? AND tenant_id=?", Boolean.class, factoryId, identity.tenantId()))) return;
        if (!factoryIds().contains(factoryId)) throw denied();
    }

    public void requirePermission(String code) {
        if (!current().permissions().contains(code)) throw denied();
    }

    public void requireHuman() {
        if (!"HUMAN".equals(actorType())) throw denied();
    }

    private static AccessDeniedException denied() { return new AccessDeniedException("无操作权限或超出授权范围"); }
}
