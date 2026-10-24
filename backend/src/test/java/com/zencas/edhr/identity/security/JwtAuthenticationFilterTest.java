package com.zencas.edhr.identity.security;

import com.zencas.edhr.common.audit.AuditContext;
import com.zencas.edhr.identity.scope.PackIdentityService;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    @Mock private JwtTokenProvider jwtTokenProvider;
    @Mock private PackIdentityService identities;
    @Mock private PackSessionService sessions;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
        AuditContext.clear();
    }

    @Test
    void validTokenExposesCurrentUserIdAsRequestAttribute() throws Exception {
        when(jwtTokenProvider.validateToken("good-token")).thenReturn(true);
        when(jwtTokenProvider.getUserId("good-token")).thenReturn("1");
        when(sessions.isActive("good-token",1L)).thenReturn(true);
        when(identities.findActive(1L)).thenReturn(java.util.Optional.of(new PackIdentityService.Identity(1L,1L,"default","admin","系统管理员","HUMAN",true,java.util.Set.of("master-data.batch-record-templates"))));
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtTokenProvider,identities,sessions);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/auth/me");
        request.addHeader("Authorization", "Bearer good-token");
        FilterChain filterChain = (servletRequest, servletResponse) -> {
            assertThat(AuditContext.getOperatorName()).isEqualTo("系统管理员");
            assertThat(AuditContext.getOperatorAccount()).isEqualTo("admin");
        };

        filter.doFilter(request, new MockHttpServletResponse(), filterChain);

        assertThat(request.getAttribute("userId")).isEqualTo("1");
        assertThat(SecurityContextHolder.getContext().getAuthentication().getAuthorities())
                .extracting(authority -> authority.getAuthority())
                .containsExactly("master-data.batch-record-templates");
    }
}
