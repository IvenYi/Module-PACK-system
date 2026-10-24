package com.zencas.edhr.masterdata.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zencas.edhr.common.exception.BusinessException;
import com.zencas.edhr.common.exception.ErrorCode;
import com.zencas.edhr.identity.scope.PackScopeService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class PackEquipmentScopeService {
    private final PackScopeService scope;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public List<Long> visibleFactoryIds() {
        return scope.isTenantAdmin() ? jdbc.queryForList("SELECT id FROM site WHERE tenant_id=?",Long.class,scope.tenantId()) : List.copyOf(scope.factoryIds());
    }

    public List<java.util.Map<String,String>> factoryOptions() {
        var allowed=visibleFactoryIds();
        return jdbc.query("SELECT id,code,name,status FROM site WHERE tenant_id=? ORDER BY code",(rs,row) -> {
            var item=new java.util.LinkedHashMap<String,String>();
            for (String key:List.of("id","code","name","status")) item.put(key,rs.getString(key));
            return item;
        },scope.tenantId()).stream().filter(factory -> allowed.contains(Long.valueOf(factory.get("id")))).map(factory -> (java.util.Map<String,String>)factory).toList();
    }

    public void require(Long id) {
        var rows=jdbc.queryForList("""
                SELECT e.site_id,s.tenant_id,t.tenant_id AS type_tenant FROM equipment e
                LEFT JOIN site s ON s.id=e.site_id LEFT JOIN equipment_type t ON t.id=e.equipment_type_id WHERE e.id=?
                """,id);
        if (rows.isEmpty()) throw new AccessDeniedException("设备不存在或不在授权范围");
        var row=rows.getFirst();
        if (!scope.tenantKey().equals(row.get("type_tenant"))) throw new AccessDeniedException("设备不属于当前租户");
        if (row.get("site_id")==null) {
            if (scope.isTenantAdmin()) return;
            throw new AccessDeniedException("设备尚未归属工厂");
        }
        if (row.get("tenant_id")==null || ((Number)row.get("tenant_id")).longValue()!=scope.tenantId()) throw new AccessDeniedException("设备不属于当前租户");
        if (!scope.isTenantAdmin() && !scope.factoryIds().contains(((Number)row.get("site_id")).longValue())) throw new AccessDeniedException("设备超出工厂授权");
    }

    public void requireTarget(Long siteId) {
        scope.requireFactory(siteId);
        var sites=jdbc.queryForList("SELECT tenant_id,status FROM site WHERE id=? FOR UPDATE",siteId);
        if (sites.isEmpty() || ((Number)sites.getFirst().get("tenant_id")).longValue()!=scope.tenantId()) throw new AccessDeniedException("工厂不属于当前租户");
        if (!"ACTIVE".equals(sites.getFirst().get("status"))) throw new BusinessException(ErrorCode.GENERAL_001,"所属工厂必须启用");
    }

    public boolean referenced(Long id) {
        for (var row:jdbc.queryForList("SELECT config_json,frozen_json FROM pack_manufacturing_version WHERE tenant_id=?",scope.tenantId())) {
            for (String column:List.of("config_json","frozen_json")) {
                if (row.get(column)==null) continue;
                try { if (contains(mapper.readTree(row.get(column).toString()),id.toString())) return true; }
                catch (Exception ex) { throw new AccessDeniedException("制造配置引用无法核对"); }
            }
        }
        return false;
    }

    private boolean contains(JsonNode node,String id) {
        if (node.isObject()) {
            if (id.equals(node.path("equipmentId").asText())) return true;
            if (node.path("equipmentIds").isArray()) for (JsonNode item:node.path("equipmentIds")) if (id.equals(item.asText())) return true;
        }
        if (node.isContainerNode()) for (JsonNode child:node) if (contains(child,id)) return true;
        return false;
    }
}
