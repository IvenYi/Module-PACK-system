package com.zencas.edhr.common.config;

import com.zencas.edhr.identity.scope.PackScopeService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import java.util.List;

@Configuration
@RequiredArgsConstructor
public class PackWebScopeConfiguration implements WebMvcConfigurer {
    private final PackScopeService scope;
    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler) {
                PackTenantContext.clear();
                var auth=SecurityContextHolder.getContext().getAuthentication();
                if (auth==null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getName())) return true;
                try {
                PackTenantContext.bind(scope.tenantKey());
                String path=request.getRequestURI();
                if (List.of("/api/v1/workflow", "/api/v1/form-instances", "/api/v1/form-management", "/api/v1/dhr-instances", "/api/v1/form-projections", "/api/v1/trace-reports", "/api/v1/dhr-filling", "/api/v1/dhr-reviews", "/api/v1/form-instance-records", "/api/v1/form-worklists", "/api/v1/form-lookup-items", "/api/v1/reports", "/api/v1/signatures", "/api/v1/production", "/api/v1/auth/me/signature", "/api/v1/compliance/signatures").stream().anyMatch(prefix->path.equals(prefix)||path.startsWith(prefix+"/"))) {
                    throw new AccessDeniedException("该医疗专属入口已退出 Pack，请使用制造、生产、质量或追溯功能");
                }
                if (path.startsWith("/api/v1/master-data/") && !List.of("/api/v1/master-data/process-modeling", "/api/v1/master-data/workshops", "/api/v1/master-data/equipment", "/api/v1/master-data/documents", "/api/v1/master-data/deletion-check").stream().anyMatch(prefix->path.equals(prefix)||path.startsWith(prefix+"/"))) {
                    throw new AccessDeniedException("请使用当前主数据维护入口");
                }
                if (path.startsWith("/api/v1/system/")) {
                    if (path.startsWith("/api/v1/system/settings/public")) return true;
                    String permission=path.contains("menu-configuration")?"system.edit":path.contains("business-dictionar")?"system.dictionaries":path.contains("icons")?"system.icons":"system.settings";
                    if (!(request.getMethod().equals("GET") && (path.equals("/api/v1/system/menu-configuration") || path.matches("/api/v1/system/business-dictionaries/[^/]+/options")))) scope.requirePermission(permission);
                    if (!request.getMethod().equals("GET")) {scope.requirePermission("system.edit");scope.requireHuman(); if (!path.contains("business-dictionar") && !scope.isTenantAdmin()) throw new AccessDeniedException("实例级系统配置仅内置管理员可维护");}
                }
                if (path.startsWith("/api/v1/master-data/") && !request.getMethod().equals("GET")) {scope.requirePermission("master-data.edit");scope.requireHuman();}
                return true;
                } catch (RuntimeException error) { PackTenantContext.clear(); throw error; }
            }
            @Override public void afterCompletion(HttpServletRequest request,HttpServletResponse response,Object handler,Exception ex) { PackTenantContext.clear(); }
        }).addPathPatterns("/api/v1/**");
    }
}
