package com.zencas.edhr.identity.service;

import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import com.zencas.edhr.identity.scope.PackScopeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.access.AccessDeniedException;
import java.util.Map;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.zencas.edhr.identity.service.ProductionResourceService.Kind.*;

class ProductionResourceServiceTest {
    JdbcTemplate jdbc;
    PackScopeService scope;
    ProductionResourceService service;
    @BeforeEach void setup() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:resources"+System.nanoTime()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE site(id BIGINT PRIMARY KEY,tenant_id BIGINT,code VARCHAR,name VARCHAR,address VARCHAR,status VARCHAR,created_at TIMESTAMP,updated_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE workshop(id BIGINT PRIMARY KEY,tenant_id BIGINT,site_id BIGINT,code VARCHAR,name VARCHAR,status VARCHAR)");
        jdbc.execute("CREATE TABLE production_line(id BIGINT PRIMARY KEY,workshop_id BIGINT,code VARCHAR,name VARCHAR,status VARCHAR,description VARCHAR,created_at TIMESTAMP,updated_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE pack_workstation(id BIGINT PRIMARY KEY,tenant_id BIGINT,site_id BIGINT,workshop_id BIGINT,production_line_id BIGINT,code VARCHAR,name VARCHAR,status VARCHAR,execution_mode VARCHAR,description VARCHAR,created_at TIMESTAMP,updated_at TIMESTAMP)");
        jdbc.execute("CREATE TABLE audit_event(id BIGINT PRIMARY KEY,tenant_id VARCHAR,entity_type VARCHAR,entity_id VARCHAR,action VARCHAR,content_before VARCHAR,content_after VARCHAR,operator_id VARCHAR,operator_name VARCHAR,created_at TIMESTAMP)");
        jdbc.update("INSERT INTO site(id,tenant_id,code,name,status) VALUES(1,1,'F1','本厂','ACTIVE'),(2,1,'F2','其他厂','ACTIVE'),(3,2,'F3','其他租户','ACTIVE')");
        jdbc.update("INSERT INTO workshop VALUES(10,1,1,'W1','车间一','ACTIVE'),(20,1,2,'W2','车间二','ACTIVE')");
        jdbc.update("INSERT INTO production_line(id,workshop_id,code,name,status) VALUES(100,10,'L1','产线一','ACTIVE'),(200,20,'L2','产线二','ACTIVE')");
        scope=mock(PackScopeService.class);
        when(scope.tenantId()).thenReturn(1L); when(scope.tenantKey()).thenReturn("default");
        when(scope.factoryIds()).thenReturn(Set.of(1L));
        doAnswer(call->{if (!Set.of(1L).contains(call.getArgument(0))) throw new AccessDeniedException("无工厂权限");return null;}).when(scope).requireFactory(anyLong());
        service=new ProductionResourceService(jdbc,scope,new SnowflakeIdGenerator(1));
    }
    @Test void filtersFactoriesAndRejectsCrossFactoryDirectAccess() {
        var page=service.list(FACTORY,null,null,null,1,20);
        assertThat(page.getTotalElements()).isEqualTo(1);
        assertThatThrownBy(()->service.get(FACTORY,2)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(()->service.get(FACTORY,3)).isInstanceOf(RuntimeException.class);
    }
    @Test void stationInheritsTrustedHierarchyAndPreventsReferencedLineDeletion() {
        var result=service.save(STATION,null,Map.of("code","S1","name","装配工位","productionLineId","100","siteId","2","tenantId","999","executionMode","MANUAL"));
        long id=Long.parseLong(result.get("id").toString());
        assertThat(jdbc.queryForObject("SELECT tenant_id FROM pack_workstation WHERE id=?",Long.class,id)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT site_id FROM pack_workstation WHERE id=?",Long.class,id)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT workshop_id FROM pack_workstation WHERE id=?",Long.class,id)).isEqualTo(10L);
        assertThatThrownBy(()->service.delete(LINE,100)).hasMessageContaining("引用");
        service.delete(STATION,id);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM pack_workstation",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_event",Integer.class)).isEqualTo(2);
    }
    @Test void rejectsCrossFactoryParentAndDuplicateCode() {
        assertThatThrownBy(()->service.save(STATION,null,Map.of("code","S1","name","工位","productionLineId","200"))).isInstanceOf(AccessDeniedException.class);
        service.save(STATION,null,Map.of("code","S1","name","工位","productionLineId","100"));
        assertThatThrownBy(()->service.save(STATION,null,Map.of("code","s1","name","重复","productionLineId","100"))).hasMessageContaining("编码已存在");
    }
}
