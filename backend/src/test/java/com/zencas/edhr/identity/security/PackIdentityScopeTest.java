package com.zencas.edhr.identity.security;

import com.zencas.edhr.identity.scope.PackIdentityService;
import com.zencas.edhr.identity.scope.PackScopeService;
import com.zencas.edhr.identity.scope.PackRoleScopeService;
import com.zencas.edhr.identity.scope.PackFileAccessService;
import com.zencas.edhr.identity.scope.PackAuditAccessService;
import com.zencas.edhr.compliance.entity.FileObject;
import com.zencas.edhr.compliance.entity.AuditEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

class PackIdentityScopeTest {
    JdbcTemplate jdbc;
    PackIdentityService identities;
    PackSessionService sessions;
    PackScopeService scope;
    JwtTokenProvider tokens = new JwtTokenProvider("pack-test-secret-with-more-than-thirty-two-characters", 3600000);

    @BeforeEach
    void prepare() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE tenant(id BIGINT PRIMARY KEY,code VARCHAR,status VARCHAR)");
        jdbc.execute("CREATE TABLE user_account(id BIGINT PRIMARY KEY,tenant_id BIGINT,username VARCHAR,display_name VARCHAR,source VARCHAR,builtin_admin BOOLEAN,status VARCHAR,locked_until TIMESTAMP)");
        jdbc.execute("CREATE TABLE permission(id BIGINT PRIMARY KEY,code VARCHAR)");
        jdbc.execute("CREATE TABLE role(id BIGINT PRIMARY KEY,tenant_id BIGINT,code VARCHAR)");
        jdbc.execute("CREATE TABLE user_role(user_id BIGINT,role_id BIGINT)");
        jdbc.execute("CREATE TABLE role_permission(role_id BIGINT,permission_id BIGINT)");
        jdbc.execute("CREATE TABLE site(id BIGINT PRIMARY KEY,tenant_id BIGINT,status VARCHAR)");
        jdbc.execute("CREATE TABLE pack_role_scope(role_id BIGINT,factory_mode VARCHAR)");
        jdbc.execute("CREATE TABLE pack_role_factory(role_id BIGINT,factory_id BIGINT)");
        jdbc.execute("CREATE TABLE pack_auth_session(token_hash VARCHAR PRIMARY KEY,user_id BIGINT,expires_at TIMESTAMP,revoked_at TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        jdbc.execute("CREATE TABLE pack_manufacturing_version(id BIGINT,tenant_id BIGINT,site_id BIGINT,status VARCHAR,config_json TEXT,frozen_json TEXT)");
        jdbc.execute("CREATE TABLE sop_document(id BIGINT,tenant_id VARCHAR)");
        jdbc.execute("CREATE TABLE document_version(id BIGINT,document_id BIGINT,file_id BIGINT)");
        jdbc.update("INSERT INTO tenant VALUES (1,'default','ACTIVE'),(2,'tenant-b','ACTIVE')");
        jdbc.update("INSERT INTO user_account(id,tenant_id,username,display_name,source,builtin_admin,status) VALUES (1,1,'admin','管理员','HUMAN',TRUE,'ACTIVE'),(2,1,'operator','操作员','HUMAN',FALSE,'ACTIVE')");
        jdbc.update("INSERT INTO role VALUES (1,1,'ADMIN'),(2,1,'OPERATOR'),(3,2,'OPERATOR')");
        jdbc.update("INSERT INTO permission VALUES (10,'pack.execution.operate'),(11,'system.edit')");
        jdbc.update("INSERT INTO user_role VALUES (1,1),(2,2)");
        jdbc.update("INSERT INTO role_permission VALUES (2,10),(3,11)");
        jdbc.update("INSERT INTO site VALUES (100,1,'ACTIVE'),(101,1,'ACTIVE'),(102,1,'INACTIVE'),(200,2,'ACTIVE')");
        jdbc.update("INSERT INTO pack_role_scope VALUES (1,'ALL'),(2,'SELECTED'),(3,'ALL')");
        jdbc.update("INSERT INTO pack_role_factory VALUES (2,100)");
        identities = new PackIdentityService(jdbc);
        sessions = new PackSessionService(jdbc);
        scope = new PackScopeService(jdbc, identities);
        asUser(2L);
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void selectedFactoriesDoNotExpandAndForeignRoleCannotGrantAnotherTenant() {
        jdbc.update("INSERT INTO user_role VALUES (2,3)");
        assertThat(scope.tenantKey()).isEqualTo("default");
        assertThat(scope.factoryIds()).containsExactly(100L);
        assertThatThrownBy(() -> scope.requireFactory(101L)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> scope.requireFactory(200L)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> scope.requirePermission("system.edit")).isInstanceOf(AccessDeniedException.class);
        jdbc.update("INSERT INTO site VALUES (103,1,'ACTIVE')");
        assertThat(scope.factoryIds()).containsExactly(100L);
    }

    @Test void builtinAdminCoversNewFactoriesButNeverAnotherTenantAndCanMaintainInactiveFactory() {
        asUser(1L);
        jdbc.update("INSERT INTO site VALUES (103,1,'ACTIVE')");
        assertThat(scope.factoryIds()).containsExactly(100L,101L,103L);
        assertThatCode(() -> scope.requireFactory(102L)).doesNotThrowAnyException();
        assertThatThrownBy(() -> scope.requireFactory(200L)).isInstanceOf(AccessDeniedException.class);
        jdbc.update("DELETE FROM role_permission");
        assertThatCode(() -> scope.requirePermission("system.edit")).doesNotThrowAnyException();
    }

    @Test void databasePermissionAndAccountRevocationApplyToTheNextRequest() throws Exception {
        var token = tokens.generateToken("2", "operator", "操作员", 60, List.of("system.edit"));
        sessions.register(token, 2L, 60);
        assertThat(authenticate(token)).containsExactly("pack.execution.operate");
        jdbc.update("DELETE FROM role_permission WHERE role_id=2");
        assertThat(authenticate(token)).isEmpty();
        jdbc.update("UPDATE user_account SET status='DISABLED' WHERE id=2");
        assertThat(authenticate(token)).isNull();
    }

    @Test void logoutRevokesOnlyThatSessionAndPasswordRevocationInvalidatesEverySession() throws Exception {
        var first = tokens.generateToken("2", "operator");
        var second = tokens.generateToken("2", "operator");
        assertThat(second).isNotEqualTo(first);
        sessions.register(first,2L,60);
        sessions.register(second,2L,60);
        sessions.revoke(first);
        assertThat(authenticate(first)).isNull();
        assertThat(authenticate(second)).containsExactly("pack.execution.operate");
        sessions.revokeUser(2L);
        assertThat(authenticate(second)).isNull();
    }

    @Test void roleFactoryScopePersistsAndCannotBeGrantedOutsideTheManagersScope() {
        asUser(1L);
        var roles = new PackRoleScopeService(jdbc,scope);
        roles.save(2L,"SELECTED",List.of(101L));
        asUser(2L);
        assertThat(new PackScopeService(jdbc,new PackIdentityService(jdbc)).factoryIds()).containsExactly(101L);
        jdbc.update("INSERT INTO role_permission VALUES (2,11)");
        assertThatThrownBy(() -> roles.save(2L,"ALL",List.of())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> roles.save(2L,"SELECTED",List.of(200L))).isInstanceOf(AccessDeniedException.class);
        assertThat(roles.get(2L).factoryIds()).containsExactly("101");
        assertThatThrownBy(() -> roles.get(3L)).isInstanceOf(AccessDeniedException.class);
    }

    @Test void fabricatedFileTargetCannotGrantAccessButFrozenSopWithinAuthorizedFactoryCan() {
        var files = new PackFileAccessService(scope,jdbc,new ObjectMapper());
        var file = FileObject.builder().id(42L).tenantId("default").uploadedBy("999").targetType("PACK_OBJECT").targetId("100").build();
        jdbc.update("INSERT INTO permission VALUES (12,'pack.execution.view')");
        jdbc.update("INSERT INTO role_permission VALUES (2,12)");
        assertThatThrownBy(() -> files.requireRead(file)).isInstanceOf(AccessDeniedException.class);
        jdbc.update("INSERT INTO pack_manufacturing_version VALUES (1,1,101,'PUBLISHED',NULL,?)","{\"operations\":[{\"documents\":[{\"fileId\":\"42\"}]}]}");
        assertThatThrownBy(() -> files.requireRead(file)).isInstanceOf(AccessDeniedException.class);
        jdbc.update("UPDATE pack_manufacturing_version SET site_id=100");
        assertThatCode(() -> files.requireRead(file)).doesNotThrowAnyException();
        file.setTenantId("tenant-b");
        assertThatThrownBy(() -> files.requireRead(file)).isInstanceOf(AccessDeniedException.class);
        file.setTenantId("default"); file.setUploadedBy("2");
        assertThatThrownBy(() -> files.requireDelete(file)).hasMessageContaining("制造快照");
    }

    @Test void auditCannotExposeAnotherFactoryOrTenantEvenWhenItsOperatorMatches() {
        var audits = new PackAuditAccessService(scope,new ObjectMapper());
        var audit = AuditEvent.builder().tenantId("default").operatorId("2").entityType("PACK_OBJECT").contentAfter("{\"siteId\":\"101\"}").build();
        assertThat(audits.canRead(audit)).isFalse();
        audit.setContentAfter("{\"siteId\":\"100\"}");
        assertThat(audits.canRead(audit)).isTrue();
        audit.setTenantId("tenant-b");
        assertThat(audits.canRead(audit)).isFalse();
        asUser(1L);
        assertThat(audits.canRead(audit)).isFalse();
    }

    private List<String> authenticate(String token) throws Exception {
        SecurityContextHolder.clearContext();
        var request = new MockHttpServletRequest("GET", "/api/v1/pack/orders");
        request.addHeader("Authorization", "Bearer "+token);
        var filter = new JwtAuthenticationFilter(tokens, identities, sessions);
        final java.util.concurrent.atomic.AtomicReference<List<String>> result = new java.util.concurrent.atomic.AtomicReference<>();
        filter.doFilter(request,new MockHttpServletResponse(),(req,res) -> {
            var authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null) result.set(authentication.getAuthorities().stream().map(a -> a.getAuthority()).sorted().toList());
        });
        return result.get();
    }

    private void asUser(Long id) { SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(id.toString(),null,List.of())); }
}
