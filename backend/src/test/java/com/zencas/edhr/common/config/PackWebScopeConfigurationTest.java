package com.zencas.edhr.common.config;

import com.zencas.edhr.identity.scope.PackScopeService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.handler.MappedInterceptor;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PackWebScopeConfigurationTest {
    final PackScopeService scope = mock(PackScopeService.class);
    HandlerInterceptor interceptor;
    static class Registry extends InterceptorRegistry { List<Object> built() { return getInterceptors(); } }
    @BeforeEach void setup() {
        when(scope.tenantKey()).thenReturn("factory-customer-b");
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("201", "", List.of()));
        Registry registry = new Registry();
        new PackWebScopeConfiguration(scope).addInterceptors(registry);
        interceptor = ((MappedInterceptor) registry.built().getFirst()).getInterceptor();
    }
    @AfterEach void cleanup() { PackTenantContext.clear(); SecurityContextHolder.clearContext(); }
    @Test void trustedRequestScopeSurvivesOnlyUntilCompletion() throws Exception {
        var request = new MockHttpServletRequest("GET", "/api/v1/master-data/process-modeling/materials");
        assertThat(interceptor.preHandle(request, new MockHttpServletResponse(), this)).isTrue();
        assertThat(PackTenantContext.key()).isEqualTo("factory-customer-b");
        interceptor.afterCompletion(request, new MockHttpServletResponse(), this, null);
        assertThatThrownBy(PackTenantContext::key).isInstanceOf(AccessDeniedException.class);
    }
    @Test void retiredMedicalWriteIsBlockedAndCannotLeakScopeToNextRequest() {
        assertThatThrownBy(() -> interceptor.preHandle(new MockHttpServletRequest("POST", "/api/v1/dhr-instances/42"), new MockHttpServletResponse(), this)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(PackTenantContext::key).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> interceptor.preHandle(new MockHttpServletRequest("GET", "/api/v1/form-lookup-items"), new MockHttpServletResponse(), this)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(PackTenantContext::key).isInstanceOf(AccessDeniedException.class);
        verify(scope, never()).requirePermission("master-data.edit");
    }
    @Test void authenticatedMenuReadNeedsNoAdministrationPrivilegeButMasterWriteDoes() throws Exception {
        interceptor.preHandle(new MockHttpServletRequest("GET", "/api/v1/system/menu-configuration"), new MockHttpServletResponse(), this);
        verify(scope, never()).requirePermission(anyString());
        doThrow(new AccessDeniedException("no write")).when(scope).requirePermission("master-data.edit");
        assertThatThrownBy(() -> interceptor.preHandle(new MockHttpServletRequest("POST", "/api/v1/master-data/process-modeling/materials"), new MockHttpServletResponse(), this)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(PackTenantContext::key).isInstanceOf(AccessDeniedException.class);
    }
}
