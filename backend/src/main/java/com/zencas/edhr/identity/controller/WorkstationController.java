package com.zencas.edhr.identity.controller;

import com.zencas.edhr.common.dto.ApiResponse;
import com.zencas.edhr.common.dto.PageResult;
import com.zencas.edhr.identity.service.ProductionResourceService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import static com.zencas.edhr.identity.service.ProductionResourceService.Kind.STATION;

@RestController
@RequestMapping("/api/v1/identity/workstations")
@PreAuthorize("hasAuthority('master-data.workstations')")
@RequiredArgsConstructor
public class WorkstationController {
    private final ProductionResourceService resources;
    @GetMapping
    public ApiResponse<PageResult<Map<String,Object>>> list(
            @RequestParam(required=false) String keyword,
            @RequestParam(required=false) String status,
            @RequestParam(required=false) Long parentId,
            @RequestParam(defaultValue="1") int page,
            @RequestParam(defaultValue="20") int size) {
        return ApiResponse.success(resources.list(STATION,keyword,status,parentId,page,size));
    }
    @GetMapping("/{id}")
    public ApiResponse<Map<String,Object>> getById(@PathVariable Long id) {
        return ApiResponse.success(resources.get(STATION,id));
    }
    @PostMapping
    @PreAuthorize("hasAuthority('master-data.workstations') and hasAuthority('master-data.edit')")
    public ApiResponse<Map<String,Object>> create(@RequestBody Map<String,Object> body) {
        return ApiResponse.success(resources.save(STATION,null,body));
    }
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('master-data.workstations') and hasAuthority('master-data.edit')")
    public ApiResponse<Map<String,Object>> update(@PathVariable Long id,@RequestBody Map<String,Object> body) {
        return ApiResponse.success(resources.save(STATION,id,body));
    }
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('master-data.workstations') and hasAuthority('master-data.edit')")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        resources.delete(STATION,id);return ApiResponse.success(null);
    }
}
