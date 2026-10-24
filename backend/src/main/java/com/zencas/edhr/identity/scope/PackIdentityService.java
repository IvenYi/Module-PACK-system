package com.zencas.edhr.identity.scope;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;

/** Server-owned identity snapshot; never trusts permission or scope claims supplied by a client. */
@Service
@RequiredArgsConstructor
public class PackIdentityService {
    private final JdbcTemplate jdbc;

    public Optional<Identity> findActive(Long userId) {
        return jdbc.query("""
                SELECT u.id, u.tenant_id, t.code AS tenant_code, u.username, u.display_name,
                       u.source, u.builtin_admin FROM user_account u JOIN tenant t ON t.id=u.tenant_id
                WHERE u.id=? AND u.status='ACTIVE' AND t.status='ACTIVE'
                  AND (u.locked_until IS NULL OR u.locked_until<=CURRENT_TIMESTAMP)
                """, (rs, row) -> new Identity(rs.getLong("id"), rs.getLong("tenant_id"),
                rs.getLong("tenant_id") == 1L ? "default" : rs.getString("tenant_code"),
                rs.getString("username"), rs.getString("display_name"), rs.getString("source"),
                rs.getBoolean("builtin_admin"), Set.of()), userId).stream().findFirst().map(identity -> {
            Set<String> permissions = new LinkedHashSet<>(identity.builtinAdmin()
                    ? jdbc.queryForList("SELECT code FROM permission", String.class)
                    : jdbc.queryForList("""
                        SELECT DISTINCT p.code FROM permission p JOIN role_permission rp ON rp.permission_id=p.id
                        JOIN role r ON r.id=rp.role_id JOIN user_role ur ON ur.role_id=r.id
                        WHERE ur.user_id=? AND r.tenant_id=?
                        """, String.class, userId, identity.tenantId()));
            return new Identity(identity.userId(), identity.tenantId(), identity.tenantKey(), identity.username(),
                    identity.displayName(), identity.actorType(), identity.builtinAdmin(), Set.copyOf(permissions));
        });
    }

    public record Identity(Long userId, Long tenantId, String tenantKey, String username, String displayName,
                           String actorType, boolean builtinAdmin, Set<String> permissions) { }
}
