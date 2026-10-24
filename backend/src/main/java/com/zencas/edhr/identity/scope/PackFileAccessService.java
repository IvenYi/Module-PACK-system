package com.zencas.edhr.identity.scope;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zencas.edhr.common.exception.BusinessException;
import com.zencas.edhr.common.exception.ErrorCode;
import com.zencas.edhr.compliance.entity.FileObject;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** File metadata supplied during upload does not confer access to its claimed business target. */
@Service
@RequiredArgsConstructor
public class PackFileAccessService {
    private final PackScopeService scope;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public boolean canRead(FileObject file) {
        if (!Objects.equals(file.getTenantId(),scope.tenantKey())) return false;
        if (scope.isTenantAdmin() || Objects.equals(file.getUploadedBy(),scope.actorId())) return true;
        var permissions = scope.current().permissions();
        boolean manufacturing = permissions.contains("pack.manufacturing.view");
        if (!manufacturing && permissions.stream().noneMatch(code -> List.of("pack.production.view","pack.execution.view","pack.quality.view","pack.trace.view").contains(code))) return false;
        for (var version : jdbc.queryForList("SELECT site_id,status,config_json,frozen_json FROM pack_manufacturing_version WHERE tenant_id=?",scope.tenantId())) {
            if (!scope.factoryIds().contains(((Number)version.get("site_id")).longValue())) continue;
            boolean published = "PUBLISHED".equals(version.get("status"));
            if (!published && !manufacturing) continue;
            for (JsonNode document : documents(parse((String)version.get(published ? "frozen_json" : "config_json")))) {
                if (published && file.getId().toString().equals(document.path("fileId").asText())) return true;
                if (!published && document.hasNonNull("documentVersionId") && Boolean.TRUE.equals(jdbc.queryForObject("""
                        SELECT COUNT(*)>0 FROM document_version v JOIN sop_document d ON d.id=v.document_id
                        WHERE v.id=? AND v.file_id=? AND d.tenant_id=?
                        """,Boolean.class,document.path("documentVersionId").asText(),file.getId(),scope.tenantKey()))) return true;
            }
        }
        return false;
    }

    public void requireRead(FileObject file) {
        if (!canRead(file)) throw new AccessDeniedException("文件不属于当前授权范围");
    }

    public void requireDelete(FileObject file) {
        requireRead(file);
        if (!scope.isTenantAdmin() && !Objects.equals(file.getUploadedBy(),scope.actorId())) throw new AccessDeniedException("只有上传者或本租户管理员可删除文件");
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT COUNT(*)>0 FROM document_version WHERE file_id=?",Boolean.class,file.getId()))) throw retained();
        for (String snapshot : jdbc.queryForList("SELECT frozen_json FROM pack_manufacturing_version WHERE tenant_id=? AND frozen_json IS NOT NULL",String.class,scope.tenantId())) {
            if (documents(parse(snapshot)).stream().anyMatch(document -> file.getId().toString().equals(document.path("fileId").asText()))) throw retained();
        }
    }

    private BusinessException retained() { return new BusinessException(ErrorCode.GENERAL_003,"文件已被受控文档或制造快照引用，不能删除"); }
    private JsonNode parse(String json) {
        try { return json == null ? mapper.nullNode() : mapper.readTree(json); }
        catch (Exception ex) { throw new AccessDeniedException("文件引用依据不可读取"); }
    }
    private List<JsonNode> documents(JsonNode config) {
        var result = new ArrayList<JsonNode>();
        if (config.path("documents").isArray()) config.path("documents").forEach(result::add);
        if (config.path("operations").isArray()) config.path("operations").forEach(operation -> {
            if (operation.path("documents").isArray()) operation.path("documents").forEach(result::add);
        });
        return result;
    }
}
