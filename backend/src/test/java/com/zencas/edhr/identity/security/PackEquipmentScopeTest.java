package com.zencas.edhr.identity.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zencas.edhr.identity.scope.PackScopeService;
import com.zencas.edhr.masterdata.service.PackEquipmentScopeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.access.AccessDeniedException;

import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PackEquipmentScopeTest {
    JdbcTemplate jdbc;
    PackScopeService scope;
    PackEquipmentScopeService equipment;

    @BeforeEach void prepare() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sa",""));
        jdbc.execute("CREATE TABLE site(id BIGINT,tenant_id BIGINT,status VARCHAR)");
        jdbc.execute("CREATE TABLE equipment_type(id BIGINT,tenant_id VARCHAR)");
        jdbc.execute("CREATE TABLE equipment(id BIGINT,site_id BIGINT,equipment_type_id BIGINT)");
        jdbc.execute("CREATE TABLE pack_manufacturing_version(tenant_id BIGINT,config_json TEXT,frozen_json TEXT)");
        jdbc.update("INSERT INTO site VALUES (1,1,'ACTIVE'),(2,1,'ACTIVE'),(3,2,'ACTIVE'),(4,1,'INACTIVE')");
        jdbc.update("INSERT INTO equipment_type VALUES (1,'default'),(2,'tenant-b')");
        jdbc.update("INSERT INTO equipment VALUES (10,1,1),(20,2,1),(30,3,2),(40,NULL,1),(50,NULL,2)");
        scope=mock(PackScopeService.class);
        when(scope.tenantId()).thenReturn(1L);
        when(scope.tenantKey()).thenReturn("default");
        lenient().when(scope.factoryIds()).thenReturn(Set.of(1L));
        equipment=new PackEquipmentScopeService(scope,jdbc,new ObjectMapper());
    }

    @Test void directEquipmentIdCannotEscapeFactoryOrTenantAndNullRequiresBuiltinAdmin() {
        assertThatCode(() -> equipment.require(10L)).doesNotThrowAnyException();
        assertThatThrownBy(() -> equipment.require(20L)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> equipment.require(30L)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> equipment.require(40L)).isInstanceOf(AccessDeniedException.class);
        when(scope.isTenantAdmin()).thenReturn(true);
        assertThatCode(() -> equipment.require(40L)).doesNotThrowAnyException();
        assertThatThrownBy(() -> equipment.require(50L)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> equipment.require(30L)).isInstanceOf(AccessDeniedException.class);
    }

    @Test void targetRequiresActiveSameTenantFactoryAndExplicitScope() {
        doThrow(new AccessDeniedException("范围不足")).when(scope).requireFactory(2L);
        assertThatCode(() -> equipment.requireTarget(1L)).doesNotThrowAnyException();
        assertThatThrownBy(() -> equipment.requireTarget(2L)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> equipment.requireTarget(3L)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> equipment.requireTarget(4L)).hasMessageContaining("启用");
    }

    @Test void frozenOrDraftEquipmentReferencesPreventMovingOrRenamingUsedEquipment() {
        assertThat(equipment.referenced(10L)).isFalse();
        jdbc.update("INSERT INTO pack_manufacturing_version VALUES (1,?,NULL)","{\"operations\":[{\"equipmentIds\":[\"10\"]}]}");
        assertThat(equipment.referenced(10L)).isTrue();
        assertThat(equipment.referenced(20L)).isFalse();
        jdbc.update("UPDATE pack_manufacturing_version SET config_json='{}',frozen_json=?","{\"operations\":[{\"actions\":[{\"equipmentId\":\"10\"}]}]}");
        assertThat(equipment.referenced(10L)).isTrue();
    }
}
