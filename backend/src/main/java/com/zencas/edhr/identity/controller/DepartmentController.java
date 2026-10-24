package com.zencas.edhr.identity.controller;

import com.zencas.edhr.common.dto.ApiResponse;
import com.zencas.edhr.common.dto.PageResult;
import com.zencas.edhr.common.exception.BusinessException;
import com.zencas.edhr.common.exception.ErrorCode;
import com.zencas.edhr.identity.scope.PackScopeService;
import com.zencas.edhr.identity.scope.PackRoleScopeService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import com.zencas.edhr.compliance.entity.AuditEvent;
import com.zencas.edhr.compliance.repository.AuditEventRepository;
import com.zencas.edhr.identity.entity.Department;
import com.zencas.edhr.identity.entity.UserAccount;
import com.zencas.edhr.identity.entity.UserDepartment;
import com.zencas.edhr.identity.entity.UserRole;
import com.zencas.edhr.identity.repository.DepartmentRepository;
import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import com.zencas.edhr.identity.repository.UserAccountRepository;
import com.zencas.edhr.identity.repository.UserDepartmentRepository;
import com.zencas.edhr.identity.repository.UserRoleRepository;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/identity/departments")
@RequiredArgsConstructor
public class DepartmentController {

    private static final String USER_AUDIT_ENTITY_TYPE = "USER_ACCOUNT";

    private final DepartmentRepository departmentRepository;
    private final UserDepartmentRepository userDepartmentRepository;
    private final UserAccountRepository userAccountRepository;
    private final UserRoleRepository userRoleRepository;
    private final AuditEventRepository auditEventRepository;
    private final SnowflakeIdGenerator idGenerator;
    private final PackScopeService scope;
    private final PackRoleScopeService roleScopes;

    @GetMapping
    @PreAuthorize("hasAuthority('system.organization')")
    public ApiResponse<PageResult<Department>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt") String sort,
            @RequestParam(defaultValue = "desc") String order) {
        Sort.Direction direction = "asc".equalsIgnoreCase(order) ? Sort.Direction.ASC : Sort.Direction.DESC;
        PageRequest pageable = PageRequest.of(page - 1, size, Sort.by(direction, sort));
        Long tenantId=scope.tenantId();
        Page<Department> result = departmentRepository.findAll((root,query,cb) -> cb.equal(root.get("tenantId"),tenantId),pageable);
        return ApiResponse.success(PageResult.of(
                result.getContent(), page, size, result.getTotalElements()));
    }

    @GetMapping("/tree")
    @PreAuthorize("hasAuthority('system.organization')")
    public ApiResponse<List<DepartmentNode>> tree() {
        List<Department> departments = departmentRepository.findByTenantIdOrderBySortOrderAscNameAsc(scope.tenantId());
        var departmentIds=departments.stream().map(Department::getId).toList();
        List<UserDepartment> memberships = userDepartmentRepository.findByDepartmentIdIn(departmentIds).stream()
                .filter(membership -> departmentIds.contains(membership.getDepartmentId())).toList();
        List<Long> userIds = memberships.stream()
                .map(UserDepartment::getUserId)
                .distinct()
                .toList();
        Map<Long, List<UserDepartment>> departmentsByUser = memberships.stream()
                .collect(Collectors.groupingBy(UserDepartment::getUserId));
        Map<Long, List<UserRole>> rolesByUser = userIds.isEmpty()
                ? Map.of()
                : userRoleRepository.findByUserIdIn(userIds).stream()
                .filter(binding -> {
                    try { roleScopes.requireRole(binding.getRoleId()); return true; }
                    catch (AccessDeniedException ignored) { return false; }
                })
                .collect(Collectors.groupingBy(UserRole::getUserId));
        Map<Long, UserAuditOperators> auditOperatorsByUser = findUserAuditOperators(userIds);
        Map<Long, UserSummary> usersById = userAccountRepository.findAllById(userIds).stream()
                .filter(user -> java.util.Objects.equals(user.getTenantId(),scope.tenantId()))
                .collect(Collectors.toMap(
                        UserAccount::getId,
                        user -> toUserSummary(
                                user,
                                departmentsByUser.getOrDefault(user.getId(), List.of()),
                                rolesByUser.getOrDefault(user.getId(), List.of()),
                                auditOperatorsByUser.get(user.getId()))));

        Map<Long, List<UserSummary>> usersByDepartment = new HashMap<>();
        for (UserDepartment membership : memberships) {
            UserSummary user = usersById.get(membership.getUserId());
            if (user != null) {
                usersByDepartment
                        .computeIfAbsent(membership.getDepartmentId(), ignored -> new ArrayList<>())
                        .add(user);
            }
        }

        return ApiResponse.success(departmentNodes(departments,usersByDepartment));
    }

    @GetMapping("/options")
    @PreAuthorize("hasAuthority('system.users')")
    public ApiResponse<List<DepartmentNode>> options() {
        return ApiResponse.success(departmentNodes(departmentRepository.findByTenantIdOrderBySortOrderAscNameAsc(scope.tenantId()),Map.of()));
    }

    private List<DepartmentNode> departmentNodes(List<Department> departments,Map<Long,List<UserSummary>> usersByDepartment) {
        Map<Long, DepartmentNode> nodesById = new LinkedHashMap<>();
        for (Department department : departments) {
            nodesById.put(department.getId(), toDepartmentNode(
                    department,
                    usersByDepartment.getOrDefault(department.getId(), List.of()),
                    new ArrayList<>()));
        }

        List<DepartmentNode> roots = new ArrayList<>();
        for (Department department : departments) {
            DepartmentNode node = nodesById.get(department.getId());
            Long parentId = department.getParentId();
            if (parentId != null && nodesById.containsKey(parentId)) {
                nodesById.get(parentId).getChildren().add(node);
            } else {
                roots.add(node);
            }
        }
        return roots;
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('system.organization')")
    public ApiResponse<DepartmentNode> getById(@PathVariable Long id) {
        return ApiResponse.success(toDepartmentNode(requireDepartment(id),List.of(),List.of()));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('system.organization') and hasAuthority('system.edit')")
    @jakarta.transaction.Transactional
    public ApiResponse<DepartmentNode> create(@RequestBody Department entity) {
        scope.requireHuman();
        if (entity.getTenantId()!=null && !entity.getTenantId().equals(scope.tenantId())) throw new AccessDeniedException("不能创建其他租户组织");
        entity.setId(idGenerator.nextId());
        entity.setTenantId(scope.tenantId());
        validateParent(entity.getParentId(),entity.getId());
        applyDefaults(entity);

        return ApiResponse.success(toDepartmentNode(
                departmentRepository.save(entity),
                List.of(),
                List.of()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('system.organization') and hasAuthority('system.edit')")
    @jakarta.transaction.Transactional
    public ApiResponse<DepartmentNode> update(@PathVariable Long id, @RequestBody DepartmentRequest request) {
        scope.requireHuman();
        Department existing = requireDepartment(id);
        if (request.getTenantId()!=null && !request.getTenantId().equals(scope.tenantId())) throw new AccessDeniedException("不能改变组织所属租户");
        validateParent(request.getParentId(),id);
        if (request.getCode() != null && !request.getCode().isBlank()) existing.setCode(request.getCode());
        existing.setName(request.getName());
        existing.setParentId(request.getParentId());
        if (request.getSortOrder() != null) existing.setSortOrder(request.getSortOrder());
        existing.setUpdatedAt(LocalDateTime.now());

        return ApiResponse.success(toDepartmentNode(
                departmentRepository.save(existing),
                List.of(),
                List.of()));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('system.organization') and hasAuthority('system.edit')")
    @jakarta.transaction.Transactional
    public ApiResponse<Void> delete(@PathVariable Long id) {
        scope.requireHuman();
        requireDepartment(id);
        if (departmentRepository.existsByParentId(id) || userDepartmentRepository.existsByDepartmentId(id)) throw new BusinessException(ErrorCode.GENERAL_003,"组织仍有下级或人员，请先调整归属");
        departmentRepository.deleteById(id);
        return ApiResponse.success(null);
    }

    private void applyDefaults(Department entity) {
        entity.setTenantId(scope.tenantId());
        if (entity.getSortOrder() == null) entity.setSortOrder(0);
        if (entity.getCode() == null || entity.getCode().isBlank()) {
            entity.setCode(generateDepartmentCode(entity.getId()));
        }
    }

    private Department requireDepartment(Long id) {
        Department department=departmentRepository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.GENERAL_001,"组织不存在"));
        if (!java.util.Objects.equals(department.getTenantId(),scope.tenantId())) throw new AccessDeniedException("组织不属于当前租户");
        return department;
    }

    private void validateParent(Long parentId,Long ownId) {
        var seen=new java.util.HashSet<Long>();
        while (parentId!=null) {
            if (parentId.equals(ownId) || !seen.add(parentId)) throw new BusinessException(ErrorCode.GENERAL_003,"组织上级不能形成循环");
            parentId=requireDepartment(parentId).getParentId();
        }
    }

    private String generateDepartmentCode(Long id) {
        return "ORG-" + id;
    }

    private DepartmentNode toDepartmentNode(
            Department department,
            List<UserSummary> users,
            List<DepartmentNode> children) {
        return DepartmentNode.builder()
                .id(String.valueOf(department.getId()))
                .tenantId(String.valueOf(department.getTenantId()))
                .parentId(department.getParentId() == null ? null : String.valueOf(department.getParentId()))
                .code(department.getCode())
                .name(department.getName())
                .sortOrder(department.getSortOrder())
                .users(users)
                .children(children)
                .build();
    }

    private UserSummary toUserSummary(
            UserAccount user,
            List<UserDepartment> departments,
            List<UserRole> roles,
            UserAuditOperators auditOperators) {
        List<String> departmentIds = departments.stream()
                .map(UserDepartment::getDepartmentId)
                .map(String::valueOf)
                .toList();
        String primaryDepartmentId = departments.stream()
                .filter(item -> Boolean.TRUE.equals(item.getIsPrimary()))
                .findFirst()
                .map(UserDepartment::getDepartmentId)
                .map(String::valueOf)
                .orElse(departmentIds.isEmpty() ? null : departmentIds.getFirst());
        String createdBy = auditOperators == null ? null : auditOperators.createdBy();
        String updatedBy = auditOperators == null ? null : auditOperators.updatedBy();
        LocalDateTime updatedAt = user.getUpdatedAt() == null ? user.getCreatedAt() : user.getUpdatedAt();

        return UserSummary.builder()
                .id(String.valueOf(user.getId()))
                .username(user.getUsername())
                .displayName(user.getDisplayName())
                .email(user.getEmail())
                .phone(user.getPhone())
                .status(user.getStatus())
                .roleIds(roles.stream()
                        .map(UserRole::getRoleId)
                        .map(String::valueOf)
                        .toList())
                .departmentIds(departmentIds)
                .primaryDepartmentId(primaryDepartmentId)
                .createdBy(createdBy)
                .createdAt(user.getCreatedAt())
                .updatedBy(hasText(updatedBy) ? updatedBy : createdBy)
                .updatedAt(updatedAt)
                .build();
    }

    private Map<Long, UserAuditOperators> findUserAuditOperators(List<Long> userIds) {
        if (userIds.isEmpty()) return Map.of();

        List<String> entityIds = userIds.stream().map(String::valueOf).toList();
        List<AuditEvent> auditEvents = Optional
                .ofNullable(auditEventRepository.findByEntityTypeAndEntityIdIn(USER_AUDIT_ENTITY_TYPE, entityIds))
                .orElse(List.of()).stream().filter(event -> java.util.Objects.equals(event.getTenantId(),scope.tenantKey())).toList();
        Map<String, String> operatorDisplayNameByIdentity = findOperatorDisplayNames(auditEvents);
        Map<Long, UserAuditOperatorAccumulator> operatorsByUser = new HashMap<>();
        auditEvents.stream()
                .sorted(Comparator.comparing(
                        AuditEvent::getCreatedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .forEach(event -> {
                    Long userId = parseAuditUserId(event.getEntityId());
                    String operatorName = resolveAuditOperatorName(event, operatorDisplayNameByIdentity);
                    if (userId == null || !hasText(operatorName)) return;
                    operatorsByUser
                            .computeIfAbsent(userId, ignored -> new UserAuditOperatorAccumulator())
                            .accept(event, operatorName);
                });

        return operatorsByUser.entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        item -> item.getValue().toOperators()));
    }

    private Map<String, String> findOperatorDisplayNames(List<AuditEvent> auditEvents) {
        Set<Long> operatorIds = new LinkedHashSet<>();
        Set<String> operatorNames = new LinkedHashSet<>();
        for (AuditEvent event : auditEvents) {
            Long operatorId = parseAuditUserId(event.getOperatorId());
            if (operatorId != null) operatorIds.add(operatorId);

            String operatorName = trimToNull(event.getOperatorName());
            if (operatorName == null) continue;
            Long operatorNameAsId = parseAuditUserId(operatorName);
            if (operatorNameAsId != null) {
                operatorIds.add(operatorNameAsId);
            } else {
                operatorNames.add(operatorName);
            }
        }

        Map<String, String> displayNameByIdentity = new HashMap<>();
        if (!operatorIds.isEmpty()) {
            userAccountRepository.findAllById(operatorIds).stream().filter(user -> java.util.Objects.equals(user.getTenantId(),scope.tenantId())).forEach(user -> putOperatorDisplayName(displayNameByIdentity, user));
        }
        operatorNames.forEach(operatorName -> {
            if (displayNameByIdentity.containsKey(operatorName)) return;
            userAccountRepository.findByTenantIdAndUsername(scope.tenantId(),operatorName)
                    .ifPresent(user -> putOperatorDisplayName(displayNameByIdentity, user));
        });
        return displayNameByIdentity;
    }

    private void putOperatorDisplayName(Map<String, String> displayNameByIdentity, UserAccount user) {
        String displayName = trimToNull(user.getDisplayName());
        if (displayName == null) return;
        displayNameByIdentity.put(String.valueOf(user.getId()), displayName);
        if (hasText(user.getUsername())) displayNameByIdentity.put(user.getUsername().trim(), displayName);
        displayNameByIdentity.put(displayName, displayName);
    }

    private String resolveAuditOperatorName(AuditEvent event, Map<String, String> operatorDisplayNameByIdentity) {
        String operatorId = trimToNull(event.getOperatorId());
        if (operatorId != null && operatorDisplayNameByIdentity.containsKey(operatorId)) {
            return operatorDisplayNameByIdentity.get(operatorId);
        }

        String operatorName = trimToNull(event.getOperatorName());
        if (operatorName == null) return null;
        return operatorDisplayNameByIdentity.getOrDefault(operatorName, operatorName);
    }

    private Long parseAuditUserId(String value) {
        if (!hasText(value)) return null;
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String trimToNull(String value) {
        if (!hasText(value)) return null;
        return value.trim();
    }

    private record UserAuditOperators(String createdBy, String updatedBy) {
    }

    private static class UserAuditOperatorAccumulator {
        private String createdBy;
        private LocalDateTime createdAt;
        private String updatedBy;
        private LocalDateTime updatedAt;

        void accept(AuditEvent event, String operatorName) {
            String action = event.getAction() == null ? "" : event.getAction().trim().toUpperCase();
            if ("CREATE".equals(action)) {
                if (createdBy == null || isBefore(event.getCreatedAt(), createdAt)) {
                    createdBy = operatorName;
                    createdAt = event.getCreatedAt();
                }
                return;
            }

            if (updatedBy == null || isAfter(event.getCreatedAt(), updatedAt)) {
                updatedBy = operatorName;
                updatedAt = event.getCreatedAt();
            }
        }

        UserAuditOperators toOperators() {
            return new UserAuditOperators(createdBy, updatedBy);
        }

        private boolean isBefore(LocalDateTime candidate, LocalDateTime current) {
            if (current == null) return true;
            if (candidate == null) return false;
            return candidate.isBefore(current);
        }

        private boolean isAfter(LocalDateTime candidate, LocalDateTime current) {
            if (current == null) return true;
            if (candidate == null) return false;
            return candidate.isAfter(current);
        }
    }

    @Data
    @NoArgsConstructor
    public static class DepartmentRequest {
        private Long tenantId;
        private Long parentId;
        private String code;
        private String name;
        private Integer sortOrder;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DepartmentNode {
        private String id;
        private String tenantId;
        private String parentId;
        private String code;
        private String name;
        private Integer sortOrder;
        private List<UserSummary> users;
        private List<DepartmentNode> children;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserSummary {
        private String id;
        private String username;
        private String displayName;
        private String email;
        private String phone;
        private String status;
        private List<String> roleIds;
        private List<String> departmentIds;
        private String primaryDepartmentId;
        private String createdBy;
        private LocalDateTime createdAt;
        private String updatedBy;
        private LocalDateTime updatedAt;
    }
}
