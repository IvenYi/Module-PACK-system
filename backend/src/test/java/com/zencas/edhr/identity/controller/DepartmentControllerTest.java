package com.zencas.edhr.identity.controller;

import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import com.zencas.edhr.compliance.entity.AuditEvent;
import com.zencas.edhr.compliance.repository.AuditEventRepository;
import com.zencas.edhr.identity.entity.Department;
import com.zencas.edhr.identity.entity.UserAccount;
import com.zencas.edhr.identity.entity.UserDepartment;
import com.zencas.edhr.identity.entity.UserRole;
import com.zencas.edhr.identity.repository.DepartmentRepository;
import com.zencas.edhr.identity.repository.UserAccountRepository;
import com.zencas.edhr.identity.repository.UserDepartmentRepository;
import com.zencas.edhr.identity.repository.UserRoleRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Sort;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DepartmentControllerTest {

    @Mock private DepartmentRepository departmentRepository;
    @Mock private UserDepartmentRepository userDepartmentRepository;
    @Mock private UserAccountRepository userAccountRepository;
    @Mock private UserRoleRepository userRoleRepository;
    @Mock private AuditEventRepository auditEventRepository;
    @Mock private SnowflakeIdGenerator idGenerator;
    @Mock private com.zencas.edhr.identity.scope.PackScopeService scope;
    @Mock private com.zencas.edhr.identity.scope.PackRoleScopeService roleScopes;

    @InjectMocks private DepartmentController controller;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @org.junit.jupiter.api.BeforeEach void tenant() {
        org.mockito.Mockito.lenient().when(scope.tenantId()).thenReturn(1L);
        org.mockito.Mockito.lenient().when(scope.tenantKey()).thenReturn("default");
        org.mockito.Mockito.lenient().when(departmentRepository.findById(org.mockito.ArgumentMatchers.anyLong())).thenAnswer(invocation -> Optional.of(Department.builder().id(invocation.getArgument(0)).tenantId(scope.tenantId()).build()));
    }

    @Test void directDepartmentIdCannotReadAnotherTenant() {
        when(departmentRepository.findById(99L)).thenReturn(Optional.of(Department.builder().id(99L).tenantId(2L).code("OTHER").name("别的租户").build()));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.getById(99L))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    }

    @Test void foreignParentCannotBeUsedToCreateOrMoveAnOrganization() {
        when(departmentRepository.findById(99L)).thenReturn(Optional.of(Department.builder().id(99L).tenantId(2L).build()));
        var request=Department.builder().name("越界子部门").parentId(99L).build();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.create(request)).isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
        org.mockito.Mockito.verify(departmentRepository,org.mockito.Mockito.never()).save(any());
    }

    @Test void foreignMembershipCannotExposeUserInformationAndEditorOptionsContainNoPersonnel() {
        var department=Department.builder().id(1L).tenantId(1L).code("OWN").name("本租户部门").build();
        when(departmentRepository.findByTenantIdOrderBySortOrderAscNameAsc(1L)).thenReturn(List.of(department));
        when(userDepartmentRepository.findByDepartmentIdIn(any())).thenReturn(List.of(UserDepartment.builder().departmentId(1L).userId(2L).build()));
        when(userAccountRepository.findAllById(any())).thenReturn(List.of(UserAccount.builder().id(2L).tenantId(2L).username("foreign").displayName("不能泄露").build()));
        assertThat(controller.tree().getData().getFirst().getUsers()).isEmpty();
        assertThat(controller.options().getData().getFirst().getUsers()).isEmpty();
    }

    @Test
    void treeSerializesSnowflakeIdsAsStringsToPreserveFrontendPrecision() {
        long rootId = 9_007_199_254_740_993L;
        long childId = 9_007_199_254_740_995L;
        Department root = Department.builder()
                .id(rootId)
                .tenantId(1L)
                .code("ROOT")
                .name("Root")
                .sortOrder(0)
                .build();
        Department child = Department.builder()
                .id(childId)
                .tenantId(1L)
                .parentId(rootId)
                .code("CHILD")
                .name("Child")
                .sortOrder(0)
                .build();
        when(departmentRepository.findByTenantIdOrderBySortOrderAscNameAsc(1L)).thenReturn(List.of(root, child));
        when(userDepartmentRepository.findByDepartmentIdIn(any())).thenReturn(List.of());
        when(userAccountRepository.findAllById(any())).thenReturn(List.of());

        List<DepartmentController.DepartmentNode> tree = controller.tree().getData();

        assertThat(tree).hasSize(1);
        assertThat(tree.getFirst().getId()).isEqualTo(String.valueOf(rootId));
        assertThat(tree.getFirst().getChildren()).hasSize(1);
        assertThat(tree.getFirst().getChildren().getFirst().getId()).isEqualTo(String.valueOf(childId));
        assertThat(tree.getFirst().getChildren().getFirst().getParentId()).isEqualTo(String.valueOf(rootId));
    }

    @Test
    void treeIncludesUserDetailsAndRelationshipsForOrganizationPersonnelPanel() {
        long departmentId = 9_007_199_254_740_993L;
        long userId = 9_007_199_254_740_995L;
        long roleId = 9_007_199_254_740_997L;
        LocalDateTime createdAt = LocalDateTime.parse("2026-06-08T10:00:00");
        LocalDateTime updatedAt = LocalDateTime.parse("2026-06-09T11:20:00");
        Department department = Department.builder()
                .id(departmentId)
                .tenantId(1L)
                .code("QA")
                .name("质量部")
                .sortOrder(0)
                .build();
        UserAccount user = UserAccount.builder().tenantId(1L)
                .id(userId)
                .tenantId(1L)
                .username("qa01")
                .displayName("质量员")
                .email("qa01@example.com")
                .phone("13800000000")
                .status("ACTIVE")
                .passwordHash("encoded")
                .createdAt(createdAt)
                .updatedAt(updatedAt)
                .build();
        UserDepartment membership = UserDepartment.builder()
                .id(1L)
                .userId(userId)
                .departmentId(departmentId)
                .isPrimary(true)
                .build();
        UserRole role = UserRole.builder()
                .id(2L)
                .userId(userId)
                .roleId(roleId)
                .build();
        when(departmentRepository.findByTenantIdOrderBySortOrderAscNameAsc(1L)).thenReturn(List.of(department));
        when(userDepartmentRepository.findByDepartmentIdIn(any())).thenReturn(List.of(membership));
        when(userAccountRepository.findAllById(any())).thenReturn(List.of(user));
        when(userRoleRepository.findByUserIdIn(any())).thenReturn(List.of(role));
        when(auditEventRepository.findByEntityTypeAndEntityIdIn(eq("USER_ACCOUNT"), eq(List.of(String.valueOf(userId)))))
                .thenReturn(List.of(
                        AuditEvent.builder()
                                .id(201L)
                                .entityType("USER_ACCOUNT")
                                .entityId(String.valueOf(userId))
                                .action("CREATE")
                                .operatorName("系统管理员")
                                .createdAt(createdAt)
                                .build(),
                        AuditEvent.builder()
                                .id(202L)
                                .entityType("USER_ACCOUNT")
                                .entityId(String.valueOf(userId))
                                .action("UPDATE")
                                .operatorName("质量经理")
                                .createdAt(updatedAt)
                                .build()));

        DepartmentController.UserSummary summary = controller.tree().getData().getFirst().getUsers().getFirst();

        assertThat(summary.getId()).isEqualTo(String.valueOf(userId));
        assertThat(summary.getUsername()).isEqualTo("qa01");
        assertThat(summary.getDisplayName()).isEqualTo("质量员");
        assertThat(summary.getEmail()).isEqualTo("qa01@example.com");
        assertThat(summary.getPhone()).isEqualTo("13800000000");
        assertThat(summary.getStatus()).isEqualTo("ACTIVE");
        assertThat(summary.getCreatedBy()).isEqualTo("系统管理员");
        assertThat(summary.getCreatedAt()).isEqualTo(createdAt);
        assertThat(summary.getUpdatedBy()).isEqualTo("质量经理");
        assertThat(summary.getUpdatedAt()).isEqualTo(updatedAt);
        assertThat(summary.getRoleIds()).containsExactly(String.valueOf(roleId));
        assertThat(summary.getDepartmentIds()).containsExactly(String.valueOf(departmentId));
        assertThat(summary.getPrimaryDepartmentId()).isEqualTo(String.valueOf(departmentId));
    }

    @Test
    void treeFallsBackUpdatedMetadataToCreatedMetadataForNewOrganizationPersonnel() {
        long departmentId = 9_007_199_254_740_993L;
        long userId = 9_007_199_254_740_995L;
        long adminId = 1L;
        LocalDateTime createdAt = LocalDateTime.parse("2026-06-08T10:00:00");
        Department department = Department.builder()
                .id(departmentId)
                .tenantId(1L)
                .code("QA")
                .name("质量部")
                .sortOrder(0)
                .build();
        UserAccount user = UserAccount.builder().tenantId(1L)
                .id(userId)
                .tenantId(1L)
                .username("qa01")
                .displayName("质量员")
                .status("ACTIVE")
                .passwordHash("encoded")
                .createdAt(createdAt)
                .build();
        UserAccount admin = UserAccount.builder().tenantId(1L)
                .id(adminId)
                .tenantId(1L)
                .username("admin")
                .displayName("系统管理员")
                .status("ACTIVE")
                .passwordHash("encoded")
                .build();
        UserDepartment membership = UserDepartment.builder()
                .id(1L)
                .userId(userId)
                .departmentId(departmentId)
                .isPrimary(true)
                .build();
        when(departmentRepository.findByTenantIdOrderBySortOrderAscNameAsc(1L)).thenReturn(List.of(department));
        when(userDepartmentRepository.findByDepartmentIdIn(any())).thenReturn(List.of(membership));
        when(userAccountRepository.findAllById(any())).thenAnswer(invocation -> {
            Iterable<Long> ids = invocation.getArgument(0);
            List<Long> requestedIds = new java.util.ArrayList<>();
            ids.forEach(requestedIds::add);
            return requestedIds.contains(adminId) ? List.of(admin) : List.of(user);
        });
        when(userRoleRepository.findByUserIdIn(any())).thenReturn(List.of());
        when(auditEventRepository.findByEntityTypeAndEntityIdIn(eq("USER_ACCOUNT"), eq(List.of(String.valueOf(userId)))))
                .thenReturn(List.of(AuditEvent.builder()
                        .id(201L)
                        .entityType("USER_ACCOUNT")
                        .entityId(String.valueOf(userId))
                        .action("CREATE")
                        .operatorId(String.valueOf(adminId))
                        .operatorName("admin")
                        .createdAt(createdAt)
                        .build()));

        DepartmentController.UserSummary summary = controller.tree().getData().getFirst().getUsers().getFirst();

        assertThat(summary.getCreatedBy()).isEqualTo("系统管理员");
        assertThat(summary.getCreatedAt()).isEqualTo(createdAt);
        assertThat(summary.getUpdatedBy()).isEqualTo("系统管理员");
        assertThat(summary.getUpdatedAt()).isEqualTo(createdAt);
    }

    @Test
    void createSerializesSavedSnowflakeIdAsString() {
        long createdId = 9_007_199_254_740_997L;
        Department request = Department.builder()
                .parentId(9_007_199_254_740_993L)
                .code("NEW_CHILD")
                .name("New Child")
                .build();
        when(idGenerator.nextId()).thenReturn(createdId);
        when(departmentRepository.save(any(Department.class))).thenAnswer(invocation -> invocation.getArgument(0));

        DepartmentController.DepartmentNode created = controller.create(request).getData();

        assertThat(created.getId()).isEqualTo(String.valueOf(createdId));
        assertThat(created.getParentId()).isEqualTo("9007199254740993");
        assertThat(created.getTenantId()).isEqualTo("1");
    }

    @Test
    void createAcceptsParentIdFromJsonString() throws Exception {
        long parentId = 9_007_199_254_740_993L;
        Department request = objectMapper.readValue("""
                {
                  "code": "NEW_CHILD",
                  "name": "New Child",
                  "parentId": "9007199254740993"
                }
                """, Department.class);
        when(idGenerator.nextId()).thenReturn(9_007_199_254_740_997L);
        when(departmentRepository.save(any(Department.class))).thenAnswer(invocation -> invocation.getArgument(0));

        DepartmentController.DepartmentNode created = controller.create(request).getData();

        assertThat(request.getParentId()).isEqualTo(parentId);
        assertThat(created.getParentId()).isEqualTo(String.valueOf(parentId));
    }

    @Test
    void createGeneratesCodeWhenRequestOmitsCode() {
        long createdId = 9_007_199_254_740_997L;
        Department request = Department.builder()
                .parentId(9_007_199_254_740_993L)
                .name("New Child")
                .build();
        when(idGenerator.nextId()).thenReturn(createdId);
        when(departmentRepository.save(any(Department.class))).thenAnswer(invocation -> invocation.getArgument(0));

        DepartmentController.DepartmentNode created = controller.create(request).getData();

        assertThat(created.getCode()).isEqualTo("ORG-9007199254740997");
    }

    @Test
    void updatePreservesExistingMetadataWhenEditingBasicFields() {
        when(scope.tenantId()).thenReturn(8L);
        long id = 9_007_199_254_740_997L;
        LocalDateTime createdAt = LocalDateTime.parse("2026-06-08T10:00:00");
        Department existing = Department.builder()
                .id(id)
                .tenantId(8L)
                .parentId(1L)
                .code("OLD")
                .name("Old")
                .sortOrder(42)
                .createdAt(createdAt)
                .build();
        DepartmentController.DepartmentRequest request = new DepartmentController.DepartmentRequest();
        request.setParentId(2L);
        request.setCode("NEW");
        request.setName("New");
        when(departmentRepository.findById(id)).thenReturn(Optional.of(existing));
        when(departmentRepository.save(any(Department.class))).thenAnswer(invocation -> invocation.getArgument(0));

        DepartmentController.DepartmentNode updated = controller.update(id, request).getData();

        assertThat(updated.getId()).isEqualTo(String.valueOf(id));
        assertThat(updated.getTenantId()).isEqualTo("8");
        assertThat(updated.getParentId()).isEqualTo("2");
        assertThat(existing.getCode()).isEqualTo("NEW");
        assertThat(existing.getName()).isEqualTo("New");
        assertThat(existing.getSortOrder()).isEqualTo(42);
        assertThat(existing.getCreatedAt()).isEqualTo(createdAt);
        assertThat(existing.getUpdatedAt()).isNotNull();
    }

    @Test
    void updatePreservesExistingCodeWhenRequestOmitsCode() {
        long id = 9_007_199_254_740_997L;
        Department existing = Department.builder()
                .id(id)
                .tenantId(1L)
                .parentId(1L)
                .code("KEEP_ME")
                .name("Old")
                .sortOrder(0)
                .build();
        DepartmentController.DepartmentRequest request = new DepartmentController.DepartmentRequest();
        request.setParentId(1L);
        request.setName("New");
        when(departmentRepository.findById(id)).thenReturn(Optional.of(existing));
        when(departmentRepository.save(any(Department.class))).thenAnswer(invocation -> invocation.getArgument(0));

        DepartmentController.DepartmentNode updated = controller.update(id, request).getData();

        assertThat(updated.getCode()).isEqualTo("KEEP_ME");
        assertThat(existing.getCode()).isEqualTo("KEEP_ME");
    }
}
