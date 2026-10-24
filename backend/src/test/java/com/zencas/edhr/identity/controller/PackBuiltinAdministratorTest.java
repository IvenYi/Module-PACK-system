package com.zencas.edhr.identity.controller;

import com.zencas.edhr.common.exception.BusinessException;
import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import com.zencas.edhr.compliance.repository.AuditEventRepository;
import com.zencas.edhr.identity.entity.Role;
import com.zencas.edhr.identity.entity.UserAccount;
import com.zencas.edhr.identity.scope.PackScopeService;
import com.zencas.edhr.identity.scope.PackRoleScopeService;
import com.zencas.edhr.identity.security.PackSessionService;
import com.zencas.edhr.compliance.repository.SignatureRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.zencas.edhr.identity.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PackBuiltinAdministratorTest {
    @Mock RoleRepository roleRepository;
    @Mock RolePermissionRepository rolePermissionRepository;
    @Mock UserRoleRepository userRoleRepository;
    @Mock UserAccountRepository userAccountRepository;
    @Mock PermissionRepository permissionRepository;
    @Mock AuditEventRepository auditEventRepository;
    @Mock SnowflakeIdGenerator idGenerator;
    @Mock PackScopeService scope;
    @Mock PackRoleScopeService roleScopes;
    @Mock PackSessionService sessions;
    @Mock DepartmentRepository departmentRepository;
    @Mock UserDepartmentRepository userDepartmentRepository;
    @Mock SignatureRepository signatureRepository;
    @Mock PasswordEncoder passwordEncoder;
    @InjectMocks RoleController controller;
    @InjectMocks UserController users;

    @Test
    void builtinAdministratorRoleCannotLoseItsPermissions() {
        when(roleRepository.findById(1L)).thenReturn(Optional.of(Role.builder()
                .id(1L).tenantId(1L).code("ADMIN").name("系统管理员").build()));
        lenient().when(roleRepository.existsById(1L)).thenReturn(true);

        assertThatThrownBy(() -> controller.updatePermissions(1L, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("系统管理员");
        verify(rolePermissionRepository, never()).deleteByRoleId(anyLong());
    }

    @Test void builtinAccountCannotBeRenamedDisabledOrHaveRolesRemoved() {
        var admin = UserAccount.builder().id(1L).tenantId(1L).username("admin").builtinAdmin(true).status("ACTIVE").build();
        when(userAccountRepository.findById(1L)).thenReturn(Optional.of(admin));
        when(scope.tenantId()).thenReturn(1L);
        var body = new UserController.UserRequest();
        body.setUsername("renamed-admin"); body.setStatus("ACTIVE"); body.setRoleIds(java.util.List.of());
        assertThatThrownBy(() -> users.update(1L,body)).isInstanceOf(BusinessException.class).hasMessageContaining("系统管理员");
        body.setUsername("admin"); body.setStatus("DISABLED");
        assertThatThrownBy(() -> users.update(1L,body)).isInstanceOf(BusinessException.class).hasMessageContaining("系统管理员");
        assertThatThrownBy(() -> users.resetPassword(1L,new UserController.ResetPasswordRequest("OtherAdmin@123")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("本人");
        verify(userAccountRepository,never()).save(any());
        verify(userRoleRepository,never()).deleteByUserId(anyLong());
    }

    @Test void createRoleCannotOverwriteBuiltinRoleBySupplyingItsId() {
        when(scope.tenantId()).thenReturn(1L);
        when(idGenerator.nextId()).thenReturn(77L);
        when(roleRepository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        var response = controller.create(Role.builder().id(1L).tenantId(1L).code("ADMIN").name("试图覆盖").build());
        org.assertj.core.api.Assertions.assertThat(response.getData().getId()).isEqualTo("77");
        org.assertj.core.api.Assertions.assertThat(response.getData().getCode()).isEqualTo("ROLE_77");
    }
}
