package com.zencas.edhr.common.config;

import org.springframework.security.access.AccessDeniedException;

/** Trusted request context used by the retained master-data services. */
public final class PackTenantContext {
    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();
    private PackTenantContext() { }
    public static void bind(String tenantKey) {
        if (tenantKey==null || tenantKey.isBlank()) throw new AccessDeniedException("缺少租户范围");
        CURRENT.set(tenantKey);
    }
    public static String key() {
        String key=CURRENT.get();
        if (key==null) throw new AccessDeniedException("缺少可信租户范围");
        return key;
    }
    public static void clear() { CURRENT.remove(); }
}
