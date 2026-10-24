package com.zencas.edhr.pack;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.zencas.edhr.common.dto.ApiResponse;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/pack")
public class PackController {
    private final PackService service;
    public PackController(PackService service){this.service=service;}
    @GetMapping({"/catalog","/manufacturing-options"}) public ApiResponse<ObjectNode> catalog(@RequestParam Long siteId){return ApiResponse.success(service.catalog(siteId));}
    @GetMapping("/manufacturing-versions") public ApiResponse<ObjectNode> manufacturing(@RequestParam Long siteId,@RequestParam(defaultValue="") String keyword,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String status,@RequestParam(required=false) String productId){return ApiResponse.success(service.manufacturingList(siteId,keyword,page,size,status,productId));}
    @GetMapping("/manufacturing-versions/{id}") public ApiResponse<ObjectNode> manufacturing(@PathVariable String id,@RequestParam Long siteId){return ApiResponse.success(service.manufacturing(id,siteId));}
    @PostMapping("/manufacturing-versions") public ApiResponse<ObjectNode> createManufacturing(@RequestBody JsonNode body){return ApiResponse.success(service.saveManufacturing(null,body));}
    @PutMapping("/manufacturing-versions/{id}") public ApiResponse<ObjectNode> updateManufacturing(@PathVariable String id,@RequestBody JsonNode body){return ApiResponse.success(service.saveManufacturing(id,body));}
    @PostMapping("/manufacturing-versions/{id}/validate") public ApiResponse<ObjectNode> validate(@PathVariable String id,@RequestBody JsonNode body){return ApiResponse.success(service.validateManufacturing(id,body.path("siteId").asLong()));}
    @PostMapping("/manufacturing-versions/{id}/publish") public ApiResponse<ObjectNode> publish(@PathVariable String id,@RequestBody JsonNode body){return ApiResponse.success(service.publish(id,body));}
    @DeleteMapping("/manufacturing-versions/{id}") public ApiResponse<Void> delete(@PathVariable String id,@RequestParam Long siteId,@RequestParam long revision){service.deleteManufacturing(id,siteId,revision);return ApiResponse.success(null);}
    @GetMapping("/work-orders") public ApiResponse<ObjectNode> orders(@RequestParam Long siteId,@RequestParam(defaultValue="") String keyword,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size){return ApiResponse.success(service.orders(siteId,keyword,page,size));}
    @GetMapping("/work-orders/{id}") public ApiResponse<ObjectNode> order(@PathVariable String id,@RequestParam Long siteId){return ApiResponse.success(service.order(id,siteId));}
    @PostMapping("/work-orders") public ApiResponse<ObjectNode> createOrder(@RequestBody JsonNode body){return ApiResponse.success(service.createOrder(body));}
    @PutMapping("/work-orders/{id}") public ApiResponse<ObjectNode> updateOrder(@PathVariable String id,@RequestBody JsonNode body){return ApiResponse.success(service.saveOrder(id,body));}
    @PostMapping("/work-orders/{id}/accept") public ApiResponse<ObjectNode> accept(@PathVariable String id,@RequestBody JsonNode body){return ApiResponse.success(service.acceptOrder(id,body));}
    @GetMapping("/objects") public ApiResponse<ObjectNode> objects(@RequestParam Long siteId,@RequestParam(defaultValue="") String keyword,@RequestParam(defaultValue="") String type,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String workOrderId){return ApiResponse.success(service.objects(siteId,keyword,type,page,size,workOrderId));}
    @PostMapping("/objects") public ApiResponse<ObjectNode> createObject(@RequestBody JsonNode body){return ApiResponse.success(service.createObject(body));}
    @GetMapping("/execution") public ApiResponse<ObjectNode> execution(@RequestParam Long siteId,@RequestParam(required=false) String objectId,@RequestParam(required=false) String sn,@RequestParam(required=false) Long stationId){return ApiResponse.success(service.execution(siteId,objectId,sn,stationId));}
    @PostMapping("/commands") public ApiResponse<ObjectNode> command(@RequestBody JsonNode body){return ApiResponse.success(service.command(body));}
    @GetMapping("/commands/{requestId}") public ApiResponse<ObjectNode> receipt(@PathVariable String requestId,@RequestParam Long siteId){return ApiResponse.success(service.receipt(requestId,siteId));}
    @GetMapping("/quality") public ApiResponse<ObjectNode> quality(@RequestParam Long siteId,@RequestParam(defaultValue="") String keyword,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="") String queue){return ApiResponse.success(service.quality(siteId,keyword,page,size,queue));}
    @GetMapping("/trace/{id}") public ApiResponse<ObjectNode> trace(@PathVariable String id,@RequestParam Long siteId){return ApiResponse.success(service.trace(id,siteId));}
    @GetMapping("/releases/{id}") public ApiResponse<ObjectNode> release(@PathVariable String id,@RequestParam Long siteId){return ApiResponse.success(service.releaseSnapshot(id,siteId));}
    @GetMapping("/statistics") public ApiResponse<ObjectNode> statistics(@RequestParam Long siteId){return ApiResponse.success(service.statistics(siteId));}
    @PostMapping("/device-events") public ApiResponse<ObjectNode> receive(@RequestBody JsonNode body){return ApiResponse.success(service.deviceEvent(body));}
    @GetMapping("/messages") public ApiResponse<ObjectNode> messages(@RequestParam Long siteId,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size){return ApiResponse.success(service.messages(siteId,page,size));}
}
