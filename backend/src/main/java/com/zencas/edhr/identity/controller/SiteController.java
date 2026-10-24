package com.zencas.edhr.identity.controller;

import com.zencas.edhr.common.dto.ApiResponse;
import com.zencas.edhr.common.dto.PageResult;
import com.zencas.edhr.identity.service.ProductionResourceService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import static com.zencas.edhr.identity.service.ProductionResourceService.Kind.FACTORY;

@RestController
@RequestMapping("/api/v1/identity/sites")
@PreAuthorize("hasAnyAuthority('master-data.sites','pack.manufacturing.view','pack.production.view','pack.execution.view','pack.quality.view','pack.trace.view','pack.integration.view')")
@RequiredArgsConstructor
public class SiteController {
    private final ProductionResourceService resources;
    @GetMapping
    public ApiResponse<PageResult<Map<String,Object>>> list(
            @RequestParam(required=false) String keyword,
            @RequestParam(required=false) String status,
            @RequestParam(required=false) Long parentId,
            @RequestParam(defaultValue="1") int page,
            @RequestParam(defaultValue="20") int size) {
        return ApiResponse.success(resources.list(FACTORY,keyword,status,parentId,page,size));
    }
    @GetMapping("/{id}")
    public ApiResponse<Map<String,Object>> getById(@PathVariable Long id) {
        return ApiResponse.success(resources.get(FACTORY,id));
    }
    @PostMapping
    @PreAuthorize("hasAuthority('master-data.sites') and hasAuthority('master-data.edit')")
    public ApiResponse<Map<String,Object>> create(@RequestBody Map<String,Object> body) {
        return ApiResponse.success(resources.save(FACTORY,null,body));
    }
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('master-data.sites') and hasAuthority('master-data.edit')")
    public ApiResponse<Map<String,Object>> update(@PathVariable Long id,@RequestBody Map<String,Object> body) {
        return ApiResponse.success(resources.save(FACTORY,id,body));
    }
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('master-data.sites') and hasAuthority('master-data.edit')")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        resources.delete(FACTORY,id);return ApiResponse.success(null);
    }
}
