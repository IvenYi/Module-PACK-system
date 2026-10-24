package com.zencas.edhr.identity.scope;

import com.zencas.edhr.common.exception.BusinessException;
import com.zencas.edhr.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class PackRoleScopeService {
    private final JdbcTemplate jdbc;
    private final PackScopeService scope;

    public Scope get(Long roleId) {
        requireRole(roleId);
        String mode = jdbc.query("SELECT factory_mode FROM pack_role_scope WHERE role_id=?", (rs,row) -> rs.getString(1), roleId)
                .stream().findFirst().orElse("SELECTED");
        return new Scope(scope.tenantId().toString(), mode, jdbc.queryForList(
                "SELECT factory_id FROM pack_role_factory WHERE role_id=? ORDER BY factory_id", Long.class, roleId).stream().map(String::valueOf).toList());
    }

    @Transactional
    public Scope save(Long roleId, String factoryMode, List<Long> factoryIds) {
        scope.requirePermission("system.edit");
        requireRole(roleId);
        protectRole(roleId);
        if (!List.of("ALL","SELECTED").contains(factoryMode == null ? "" : factoryMode)) {
            throw new BusinessException(ErrorCode.GENERAL_001,"请选择全部工厂或指定工厂");
        }
        if ("ALL".equals(factoryMode) && !scope.hasAllFactories()) throw new AccessDeniedException("不能授予超出自身范围的工厂");
        var ids = new LinkedHashSet<>(factoryIds == null ? List.<Long>of() : factoryIds);
        for (Long id : ids) scope.requireFactory(id);
        jdbc.update("DELETE FROM pack_role_factory WHERE role_id=?", roleId);
        jdbc.update("DELETE FROM pack_role_scope WHERE role_id=?",roleId);
        jdbc.update("INSERT INTO pack_role_scope(role_id,factory_mode) VALUES (?,?)",roleId,factoryMode);
        if ("SELECTED".equals(factoryMode)) {
            for (Long id : ids) jdbc.update("INSERT INTO pack_role_factory(role_id,factory_id) VALUES (?,?)",roleId,id);
        }
        return get(roleId);
    }

    public Map<String,Object> options() {
        var result = new LinkedHashMap<String,Object>();
        result.put("tenantId",scope.tenantId().toString());
        result.put("canGrantAll",scope.hasAllFactories());
        result.put("factories",jdbc.query("SELECT id,code,name FROM site WHERE tenant_id=? ORDER BY code",(rs,row) -> {
            var item = new LinkedHashMap<String,String>();
            item.put("id",rs.getString("id")); item.put("code",rs.getString("code")); item.put("name",rs.getString("name"));
            return item;
        },scope.tenantId()).stream().filter(item -> scope.isTenantAdmin() || scope.factoryIds().contains(Long.valueOf(item.get("id")))).toList());
        return result;
    }

    public void requireRole(Long roleId) {
        if (roleId == null || !Boolean.TRUE.equals(jdbc.queryForObject("SELECT COUNT(*)>0 FROM role WHERE id=? AND tenant_id=?",
                Boolean.class,roleId,scope.tenantId()))) throw new AccessDeniedException("角色不属于当前租户");
    }

    public void requireAssignable(Long roleId, String source) {
        requireRole(roleId);
        String code = jdbc.queryForObject("SELECT code FROM role WHERE id=?",String.class,roleId);
        boolean machineRole = List.of("DEVICE","MES").contains(code);
        if (("HUMAN".equals(source) && machineRole) || (!"HUMAN".equals(source) && !source.equals(code))) {
            throw new BusinessException(ErrorCode.GENERAL_003,"设备或MES账号只能分配同名接入角色，不能混入人员角色");
        }
        var targetPermissions = jdbc.queryForList("SELECT p.code FROM permission p JOIN role_permission rp ON rp.permission_id=p.id WHERE rp.role_id=?",String.class,roleId);
        if (!scope.current().permissions().containsAll(targetPermissions)) throw new AccessDeniedException("不能授予自身没有的权限");
        var target = get(roleId);
        if ("ALL".equals(target.factoryMode()) && !scope.hasAllFactories()) throw new AccessDeniedException("不能授予超出自身范围的角色");
        for (var id : target.factoryIds()) scope.requireFactory(Long.valueOf(id));
    }

    public void protectRole(Long roleId) {
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT COUNT(*)>0 FROM role WHERE id=? AND code='ADMIN'",Boolean.class,roleId))) {
            throw new BusinessException(ErrorCode.GENERAL_003,"系统管理员角色不允许修改权限或范围");
        }
    }

    public record Scope(String tenantId, String factoryMode, List<String> factoryIds) { }
}
