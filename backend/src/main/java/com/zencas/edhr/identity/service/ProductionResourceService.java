package com.zencas.edhr.identity.service;

import com.zencas.edhr.common.dto.PageResult;
import com.zencas.edhr.common.audit.AuditContext;
import com.zencas.edhr.common.exception.BusinessException;
import com.zencas.edhr.common.exception.ErrorCode;
import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import com.zencas.edhr.identity.scope.PackScopeService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ProductionResourceService {
    public enum Kind { FACTORY, LINE, STATION }
    private final JdbcTemplate jdbc;
    private final PackScopeService scope;
    private final SnowflakeIdGenerator ids;
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();

    public PageResult<Map<String,Object>> list(Kind kind, String keyword, String status, Long parentId, int page, int size) {
        int safePage=Math.max(page,1), safeSize=Math.min(Math.max(size,1),200);
        var parameters=new ArrayList<Object>();parameters.add(scope.tenantId());
        String where=" WHERE "+tenantField(kind)+"=?";
        if (!scope.isTenantAdmin()) {
            Set<Long> factories=scope.factoryIds();
            if (factories.isEmpty()) return PageResult.empty(safePage,safeSize);
            where+=" AND "+factoryField(kind)+" IN ("+String.join(",", java.util.Collections.nCopies(factories.size(),"?"))+")";
            parameters.addAll(factories);
        }
        if (keyword!=null && !keyword.isBlank()) {
            where+=" AND (LOWER(r.code) LIKE ? OR LOWER(r.name) LIKE ?)";
            String pattern="%"+keyword.strip().toLowerCase(Locale.ROOT)+"%";
            parameters.add(pattern);parameters.add(pattern);
        }
        if (status!=null && !status.isBlank()) { where+=" AND r.status=?";parameters.add(validStatus(status)); }
        if (parentId!=null && kind!=Kind.FACTORY) { where+=" AND r."+(kind==Kind.LINE?"workshop_id":"production_line_id")+"=?";parameters.add(parentId); }
        long count=jdbc.queryForObject("SELECT count(*) FROM "+from(kind)+where,Long.class,parameters.toArray());
        parameters.add(safeSize);parameters.add((safePage-1)*safeSize);
        var rows=jdbc.queryForList(select(kind)+" FROM "+from(kind)+where+" ORDER BY r.updated_at DESC,r.id DESC LIMIT ? OFFSET ?",parameters.toArray());
        return PageResult.of(rows.stream().map(this::normalize).map(row->withReferences(kind,row)).toList(),safePage,safeSize,count);
    }
    public Map<String,Object> get(Kind kind, long id) {
        var rows=jdbc.queryForList(select(kind)+" FROM "+from(kind)+" WHERE r.id=? AND "+tenantField(kind)+"=?",id,scope.tenantId());
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.IDN_009,"生产资源不存在");
        Map<String,Object> result=normalize(rows.getFirst());
        scope.requireFactory(Long.valueOf(result.get("siteId").toString()));
        return withReferences(kind,result);
    }
    @Transactional
    public Map<String,Object> save(Kind kind, Long id, Map<String,Object> request) {
        Map<String,Object> before=id==null?Map.of():get(kind,id);
        if (kind==Kind.FACTORY && id==null && !scope.isTenantAdmin()) throw new AccessDeniedException("仅系统管理员可新增工厂");
        String code=text(request,"code",64,true),name=text(request,"name",128,true),description=text(request,"description",512,false);
        String status=validStatus(request.getOrDefault("status","ACTIVE").toString());
        Long parentId=null, siteId=null, workshopId=null;
        String mode=null;
        if (kind==Kind.LINE) {
            parentId=number(request,"workshopId");
            var parent=jdbc.queryForList("SELECT site_id,status FROM workshop WHERE id=? AND tenant_id=?",parentId,scope.tenantId());
            if (parent.isEmpty() || parent.getFirst().get("site_id")==null) throw new BusinessException(ErrorCode.GENERAL_001,"请选择已归属工厂的车间");
            siteId=((Number)parent.getFirst().get("site_id")).longValue();scope.requireFactory(siteId);
            ensureActive(parent.getFirst().get("status"),"车间");
        } else if (kind==Kind.STATION) {
            parentId=number(request,"productionLineId");
            var parent=get(Kind.LINE,parentId);
            siteId=Long.valueOf(parent.get("siteId").toString());workshopId=Long.valueOf(parent.get("workshopId").toString());
            ensureActive(parent.get("status"),"产线");
            mode=request.getOrDefault("executionMode","MANUAL").toString();
            if (!Set.of("MANUAL","SEMI_AUTO","EXTERNAL_MES").contains(mode)) throw new BusinessException(ErrorCode.GENERAL_001,"执行模式无效");
        }
        if (siteId!=null) {
            var site=get(Kind.FACTORY,siteId);ensureActive(site.get("status"),"工厂");
        }
        if (id!=null && Boolean.TRUE.equals(before.get("referenced"))) {
            boolean moved=kind==Kind.LINE && !before.get("workshopId").toString().equals(parentId.toString())
                    || kind==Kind.STATION && (!before.get("productionLineId").toString().equals(parentId.toString()) || !before.get("executionMode").equals(mode));
            if (!before.get("code").equals(code) || moved) throw new BusinessException(ErrorCode.GENERAL_003,"资源已被引用，不能修改编码、归属或执行模式");
        }
        Object owner=kind==Kind.LINE?parentId:scope.tenantId();
        String ownerColumn=kind==Kind.LINE?"workshop_id":"tenant_id";
        Long duplicates=jdbc.queryForObject("SELECT count(*) FROM "+table(kind)+" WHERE "+ownerColumn+"=? AND LOWER(code)=LOWER(?) AND id<>?",Long.class,owner,code,id==null?-1L:id);
        if (duplicates>0) throw new BusinessException(ErrorCode.GENERAL_001,"编码已存在");
        long savedId=id==null?ids.nextId():id;
        LocalDateTime now=LocalDateTime.now();
        if (kind==Kind.FACTORY) {
            String address=text(request,"address",512,false);
            if (id==null) jdbc.update("INSERT INTO site(id,tenant_id,code,name,address,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",savedId,scope.tenantId(),code,name,address,status,now,now);
            else jdbc.update("UPDATE site SET code=?,name=?,address=?,status=?,updated_at=? WHERE id=? AND tenant_id=?",code,name,address,status,now,id,scope.tenantId());
        } else if (kind==Kind.LINE) {
            if (id==null) jdbc.update("INSERT INTO production_line(id,workshop_id,code,name,description,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",savedId,parentId,code,name,description,status,now,now);
            else jdbc.update("UPDATE production_line SET workshop_id=?,code=?,name=?,description=?,status=?,updated_at=? WHERE id=?",parentId,code,name,description,status,now,id);
        } else {
            if (id==null) jdbc.update("INSERT INTO pack_workstation(id,tenant_id,site_id,workshop_id,production_line_id,code,name,description,status,execution_mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",savedId,scope.tenantId(),siteId,workshopId,parentId,code,name,description,status,mode,now,now);
            else jdbc.update("UPDATE pack_workstation SET site_id=?,workshop_id=?,production_line_id=?,code=?,name=?,description=?,status=?,execution_mode=?,updated_at=? WHERE id=? AND tenant_id=?",siteId,workshopId,parentId,code,name,description,status,mode,now,id,scope.tenantId());
        }
        Map<String,Object> after=get(kind,savedId);
        audit(kind,savedId,id==null?"CREATE":"UPDATE",before,after);
        return after;
    }
    @Transactional
    public void delete(Kind kind, long id) {
        var before=get(kind,id);
        if (Boolean.TRUE.equals(before.get("referenced"))) throw new BusinessException(ErrorCode.GENERAL_003,"资源已被引用，不能删除，请停用");
        if (kind==Kind.FACTORY && !scope.isTenantAdmin()) throw new AccessDeniedException("仅系统管理员可删除工厂");
        jdbc.update("DELETE FROM "+table(kind)+" WHERE id=?",id);
        audit(kind,id,"DELETE",before,Map.of());
    }
    private Map<String,Object> withReferences(Kind kind, Map<String,Object> row) {
        long id=Long.parseLong(row.get("id").toString());boolean used=false;
        if (kind==Kind.FACTORY) used=count("SELECT count(*) FROM workshop WHERE site_id=?",id)>0 || optionalCount("equipment","site_id",id)>0;
        else if (kind==Kind.LINE) used=count("SELECT count(*) FROM pack_workstation WHERE production_line_id=?",id)>0;
        else for (String table:List.of("pack_manufacturing_station","pack_work_order","pack_visit")) used|=optionalCount(table,"station_id",id)>0;
        if (kind==Kind.STATION) used|=optionalCount("pack_rework_order","target_station_id",id)>0;
        row.put("referenced",used);row.put("deletable",!used);return row;
    }
    private long count(String sql,long id) { return jdbc.queryForObject(sql,Long.class,id); }
    private long optionalCount(String table,String column,long id) {
        if (jdbc.queryForObject("SELECT count(*) FROM information_schema.tables WHERE lower(table_name)=?",Long.class,table)==0) return 0;
        return count("SELECT count(*) FROM "+table+" WHERE "+column+"=?",id);
    }
    private String table(Kind kind) { return switch(kind) { case FACTORY->"site";case LINE->"production_line";case STATION->"pack_workstation";}; }
    private String from(Kind kind) { return switch(kind) { case FACTORY->"site r";case LINE->"production_line r JOIN workshop w ON w.id=r.workshop_id JOIN site s ON s.id=w.site_id";case STATION->"pack_workstation r JOIN production_line l ON l.id=r.production_line_id JOIN workshop w ON w.id=r.workshop_id JOIN site s ON s.id=r.site_id";}; }
    private String tenantField(Kind kind) { return kind==Kind.LINE?"w.tenant_id":"r.tenant_id"; }
    private String factoryField(Kind kind) { return switch(kind) {case FACTORY->"r.id";case LINE->"w.site_id";case STATION->"r.site_id";}; }
    private String select(Kind kind) {
        String common="SELECT r.id,r.code,r.name,r.status,r.created_at AS \"createdAt\",r.updated_at AS \"updatedAt\","+tenantField(kind)+" AS \"tenantId\","+factoryField(kind)+" AS \"siteId\"";
        return common+switch(kind) {
            case FACTORY->",r.address,r.name AS \"siteName\"";
            case LINE->",r.workshop_id AS \"workshopId\",w.name AS \"parentName\",s.name AS \"siteName\",r.description";
            case STATION->",r.workshop_id AS \"workshopId\",r.production_line_id AS \"productionLineId\",l.name AS \"parentName\",s.name AS \"siteName\",r.description,r.execution_mode AS \"executionMode\"";
        };
    }
    private Map<String,Object> normalize(Map<String,Object> row) {
        var result=new LinkedHashMap<String,Object>();
        row.forEach((key,value)->result.put(key,value==null?null:key.equals("id")||key.endsWith("Id")||value instanceof java.sql.Timestamp?value.toString():value));return result;
    }
    private String text(Map<String,Object> body,String key,int max,boolean required) {
        String value=body.get(key)==null?"":body.get(key).toString().strip();
        if (required && value.isEmpty()) throw new BusinessException(ErrorCode.GENERAL_001,"编码和名称不能为空");
        if (value.length()>max) throw new BusinessException(ErrorCode.GENERAL_001,"字段长度超出限制");return value.isEmpty()?null:value;
    }
    private Long number(Map<String,Object> body,String key) {
        try {return Long.valueOf(body.get(key).toString());}catch(Exception ex){throw new BusinessException(ErrorCode.GENERAL_001,"请选择所属车间或产线");}
    }
    private String validStatus(String value) {
        if (!Set.of("ACTIVE","INACTIVE").contains(value)) throw new BusinessException(ErrorCode.GENERAL_001,"状态只能是启用或停用");return value;
    }
    private void ensureActive(Object status,String label) {if (!"ACTIVE".equals(status))throw new BusinessException(ErrorCode.GENERAL_001,label+"已停用");}
    private void audit(Kind kind,long id,String action,Map<String,Object> before,Map<String,Object> after) {
        try {
            jdbc.update("INSERT INTO audit_event(id,tenant_id,entity_type,entity_id,action,content_before,content_after,operator_id,operator_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    ids.nextId(),scope.tenantKey(),kind==Kind.FACTORY?"SITE":kind==Kind.LINE?"PRODUCTION_LINE":"PACK_WORKSTATION",String.valueOf(id),action,JSON.writeValueAsString(before),JSON.writeValueAsString(after),AuditContext.getOperatorId(),AuditContext.getOperatorName(),LocalDateTime.now());
        } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {throw new BusinessException(ErrorCode.GENERAL_002,"资源审计序列化失败");}
    }
}
