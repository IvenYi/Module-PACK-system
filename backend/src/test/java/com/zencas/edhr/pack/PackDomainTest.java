package com.zencas.edhr.pack;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.zencas.edhr.common.util.SnowflakeIdGenerator;
import com.zencas.edhr.common.exception.BusinessException;
import com.zencas.edhr.identity.scope.PackScopeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PackDomainTest {
    final ObjectMapper mapper = new ObjectMapper();
    JdbcTemplate db; PackService service; PackScopeService scope; TransactionTemplate tx;
    @BeforeEach void setup() throws Exception {
        var source = new DriverManagerDataSource("jdbc:h2:mem:pack-"+UUID.randomUUID()+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
        db = new JdbcTemplate(source); tx = new TransactionTemplate(new DataSourceTransactionManager(source));
        for (String ddl : new String[]{
            "site(id BIGINT PRIMARY KEY,tenant_id BIGINT,status VARCHAR(32))",
            "workshop(id BIGINT PRIMARY KEY,tenant_id BIGINT,site_id BIGINT,status VARCHAR(32))",
            "production_line(id BIGINT PRIMARY KEY,workshop_id BIGINT,status VARCHAR(32))",
            "material_type(id BIGINT PRIMARY KEY,name VARCHAR(128))",
            "material(id BIGINT PRIMARY KEY,tenant_id VARCHAR(64),code VARCHAR(64),name VARCHAR(128),version VARCHAR(32),status VARCHAR(32),unit VARCHAR(32),material_type_id BIGINT)",
            "route(id BIGINT PRIMARY KEY,tenant_id VARCHAR(64),name VARCHAR(128))",
            "route_version(id BIGINT PRIMARY KEY,route_id BIGINT,code VARCHAR(64),version VARCHAR(32),effective_date DATE,expiry_date DATE)",
            "route_node(id BIGINT PRIMARY KEY,route_version_id BIGINT,node_key VARCHAR(64),operation_name VARCHAR(128),node_type VARCHAR(32),sort_order INT)",
            "route_relation(id BIGINT PRIMARY KEY,route_version_id BIGINT,source_node_key VARCHAR(64),target_node_key VARCHAR(64),rule_expression TEXT)",
            "sop_document(id BIGINT PRIMARY KEY,tenant_id VARCHAR(64),title VARCHAR(128))",
            "document_version(id BIGINT PRIMARY KEY,document_id BIGINT,code VARCHAR(64),version VARCHAR(32),file_id BIGINT)",
            "pack_workstation(id BIGINT PRIMARY KEY,tenant_id BIGINT,site_id BIGINT,code VARCHAR(64),name VARCHAR(128),status VARCHAR(32),execution_mode VARCHAR(32),workshop_id BIGINT,production_line_id BIGINT)",
            "audit_event(id BIGINT PRIMARY KEY,tenant_id VARCHAR(64),entity_type VARCHAR(64),entity_id VARCHAR(64),action VARCHAR(64),content_before JSON,content_after JSON,snapshot_hash VARCHAR(64),operator_id VARCHAR(64),operator_name VARCHAR(128),operator_account VARCHAR(128),source VARCHAR(32),module_name VARCHAR(64),menu_name VARCHAR(64),function_name VARCHAR(64),data_summary TEXT,reason TEXT,ip_address VARCHAR(64),created_at TIMESTAMP)"
        }) db.execute("CREATE TABLE "+ddl);
        for (String migration : new String[]{"0117-pack-manufacturing.sql", "0118-pack-execution-quality.sql", "0121-pack-rework-routing.sql"}) {
            try (var input=getClass().getResourceAsStream("/db/changelog/"+migration)) {
                assertThat(input).as(migration).isNotNull();
                String sql=new String(input.readAllBytes(), StandardCharsets.UTF_8).replaceAll("(?m)^--.*$", "");
                for(String statement:sql.split(";")) if(!statement.isBlank()) db.execute(statement);
            }
        }
        db.update("INSERT INTO site VALUES(1,1,'ACTIVE')");
        db.update("INSERT INTO workshop VALUES(1,1,1,'ACTIVE')");
        db.update("INSERT INTO production_line VALUES(1,1,'ACTIVE')");
        db.update("INSERT INTO material_type VALUES(1,'原材料')");
        db.update("INSERT INTO material(id,tenant_id,code,name,version,status,unit) VALUES(10,'default','CELL','电芯','1','ACTIVE','件'),(20,'default','MODULE','模组','1','ACTIVE','件'),(30,'default','PACK','电池包','1','ACTIVE','件'),(40,'other','SECRET','他租户物料','1','ACTIVE','件')");
        db.update("UPDATE material SET material_type_id=1 WHERE id=10");
        db.update("INSERT INTO route VALUES(100,'default','装配检验')");
        db.update("INSERT INTO route_version VALUES(101,100,'R1','1',NULL,NULL)");
        db.update("INSERT INTO route_node VALUES(102,101,'assemble','装配检验','OPERATION',1)");
        db.update("INSERT INTO pack_workstation VALUES(1,1,1,'S1','装配站','ACTIVE','MANUAL',1,1)");
        scope=mock(PackScopeService.class); when(scope.tenantId()).thenReturn(1L); when(scope.tenantKey()).thenReturn("default"); when(scope.factoryIds()).thenReturn(Set.of(1L)); when(scope.actorId()).thenReturn("1"); when(scope.actorType()).thenReturn("HUMAN");
        service=new PackService(db,mapper,new SnowflakeIdGenerator(1),scope);
    }
    ObjectNode json(String text) { try{return (ObjectNode)mapper.readTree(text);}catch(Exception e){throw new RuntimeException(e);} }
    <T> T transaction(Supplier<T> call){return tx.execute(s->call.get());}
    ObjectNode manufacturing() {
        return json("""
          {"siteId":1,"productId":"20","outputType":"MODULE","code":"MOD","name":"模组制造版","version":"1","routeVersionId":"101",
           "bom":[{"slotCode":"C1","materialId":"10","quantity":1,"childType":"CELL"}],
           "operations":[{"nodeId":"assemble","name":"装配检验","stationIds":["1"],"mode":"MANUAL","actions":[
             {"code":"assemble","type":"ASSEMBLE","required":true,"source":"HUMAN","slotCodes":["C1"]},
             {"code":"measure","type":"MEASURE","required":true,"source":"HUMAN","retestAfterReplacement":true,"checks":[{"code":"V","name":"电压","kind":"NUMBER","unit":"V","min":"3","max":"4.2","required":true}]},
             {"code":"visual","type":"MANUAL_INSPECT","required":true,"source":"HUMAN","retestAfterReplacement":true,"checks":[{"code":"appearance","name":"外观","kind":"BOOLEAN","required":true}]}]}],"documents":[]}
          """);
    }
    String published() { var v=transaction(()->service.saveManufacturing(null,manufacturing())); String id=v.path("id").asText(); transaction(()->service.publish(id,json("{\"siteId\":1,\"revision\":1}")));return id; }
    String object(String code,String type,String material,String order) { var body=json("{\"siteId\":1,\"objectNo\":\""+code+"\",\"type\":\""+type+"\",\"materialId\":\""+material+"\"}");if(order!=null)body.put("workOrderId",order);return transaction(()->service.createObject(body)).path("id").asText(); }
    ObjectNode command(String object,String action,ObjectNode payload,String requestId) {
        long revision=service.execution(1L,object,null,1L).path("revision").asLong();
        var body=json("{\"siteId\":1,\"stationId\":1}").put("objectId",object).put("revision",revision).put("requestId",requestId).put("action",action);body.set("payload",payload);
        return transaction(()->service.command(body));
    }
    ObjectNode command(String object,String action,String payload){return command(object,action,json(payload),UUID.randomUUID().toString());}
    ObjectNode commandAt(String object,long station,String action,String payload) {
        ObjectNode body=json("{\"siteId\":1}").put("stationId",station).put("objectId",object).put("revision",service.execution(1L,object,null,station).path("revision").asLong()).put("requestId",UUID.randomUUID().toString()).put("action",action);body.set("payload",json(payload));
        return transaction(()->service.command(body));
    }
    String module() {String version=published();String order=transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"WO1\",\"manufacturingVersionId\":\""+version+"\",\"quantity\":1}"))).path("id").asText();transaction(()->service.acceptOrder(order,json("{\"siteId\":1,\"stationId\":1,\"revision\":1}")));return object("M1","MODULE","20",order);}

    @Test void noDhrNoFormsStillRequiresImplementedActionsAndRejectsCrossTenantReferences() {
        var empty=manufacturing();((com.fasterxml.jackson.databind.node.ArrayNode)empty.withArray("operations").get(0).get("actions")).removeAll();
        String id=transaction(()->service.saveManufacturing(null,empty)).path("id").asText();
        assertThat(service.validateManufacturing(id,1L).path("valid").asBoolean()).isFalse();
        assertThatThrownBy(()->transaction(()->service.publish(id,json("{\"siteId\":1,\"revision\":1}")))).hasMessageContaining("动作");
        var bad=manufacturing().put("productId","40");bad.put("code","BAD");
        assertThatThrownBy(()->transaction(()->service.saveManufacturing(null,bad))).hasMessageContaining("物料");
        assertThat(db.queryForObject("SELECT count(*) FROM pack_work_order",Integer.class)).isZero();
    }
    @Test void publishedMaterialsAndReceivedObjectLabelsDoNotDriftAfterMasterDataChanges() {
        String version=published();
        String cell=object("C1","CELL","10",null);
        assertThat(service.catalog(1L).path("materials").findValuesAsText("materialTypeName")).contains("原材料");
        db.update("UPDATE material SET code='RENAMED-CELL',name='后来改名的电芯',version='2',unit='个' WHERE id=10");
        db.update("UPDATE material SET code='RENAMED-MODULE',name='后来改名的模组' WHERE id=20");
        String order=transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"SNAPSHOT\",\"manufacturingVersionId\":\""+version+"\",\"quantity\":1}"))).path("id").asText();
        String module=object("M1","MODULE","20",order);
        var context=service.execution(1L,module,null,1L);
        assertThat(context.at("/object/materialCode").asText()).isEqualTo("MODULE");
        assertThat(context.at("/object/materialName").asText()).isEqualTo("模组");
        assertThat(context.at("/slots/0/materialCode").asText()).isEqualTo("CELL");
        assertThat(context.at("/slots/0/materialName").asText()).isEqualTo("电芯");
        assertThat(context.at("/slots/0/materialVersion").asText()).isEqualTo("1");
        assertThat(context.at("/slots/0/unit").asText()).isEqualTo("件");
        assertThat(service.trace(cell,1L).at("/object/materialCode").asText()).isEqualTo("CELL");
        assertThat(service.manufacturingList(1L,"",1,20,"PUBLISHED","20").path("totalElements").asInt()).isEqualTo(1);
        assertThat(service.manufacturingList(1L,"",1,20,"PUBLISHED","30").path("totalElements").asInt()).isZero();
    }
    @Test void outputTypeAndBomHierarchyAreMandatoryAndOrderObjectsDeriveFrozenType() {
        var missing=manufacturing().put("code","NO-OUTPUT");missing.remove("outputType");
        String invalid=transaction(()->service.saveManufacturing(null,missing)).path("id").asText();
        assertThatThrownBy(()->transaction(()->service.publish(invalid,json("{\"siteId\":1,\"revision\":1}")))).hasMessageContaining("产出类型");
        var wrong=manufacturing().put("code","WRONG-HIERARCHY").put("outputType","PACK");
        String wrongId=transaction(()->service.saveManufacturing(null,wrong)).path("id").asText();
        assertThatThrownBy(()->transaction(()->service.publish(wrongId,json("{\"siteId\":1,\"revision\":1}")))).hasMessageContaining("PACK");
        String version=published();String order=transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"TYPED\",\"manufacturingVersionId\":\""+version+"\",\"quantity\":1}"))).path("id").asText();
        assertThatThrownBy(()->object("WRONG-TYPE","PACK","30",order)).hasMessageContaining("产出类型");
        var body=json("{\"siteId\":1,\"objectNo\":\"DERIVED\"}").put("workOrderId",order);
        assertThat(transaction(()->service.createObject(body)).path("objectType").asText()).isEqualTo("MODULE");
        assertThat(db.queryForObject("SELECT count(*) FROM pack_object WHERE work_order_id=?",Integer.class,order)).isEqualTo(1);
    }
    @Test void inactiveFactoryOrStationParentsBlockWritesWithoutHidingHistory() {
        String version=published();String order=transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"PARENTS\",\"manufacturingVersionId\":\""+version+"\",\"quantity\":1}"))).path("id").asText();
        String module=object("M1","MODULE","20",order);object("C1","CELL","10",null);
        db.update("UPDATE production_line SET status='INACTIVE'");
        assertThatThrownBy(()->transaction(()->service.acceptOrder(order,json("{\"siteId\":1,\"stationId\":1,\"revision\":1}")))).hasMessageContaining("产线");
        db.update("UPDATE production_line SET status='ACTIVE'");transaction(()->service.acceptOrder(order,json("{\"siteId\":1,\"stationId\":1,\"revision\":1}")));
        db.update("UPDATE workshop SET status='INACTIVE'");
        assertThatThrownBy(()->command(module,"CHECK_IN","{\"nodeId\":\"assemble\"}")).hasMessageContaining("车间");
        db.update("UPDATE workshop SET status='ACTIVE'");command(module,"CHECK_IN","{\"nodeId\":\"assemble\"}");
        db.update("UPDATE production_line SET status='INACTIVE'");
        assertThatThrownBy(()->command(module,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"C1\"}")).hasMessageContaining("产线");
        db.update("UPDATE production_line SET status='ACTIVE'");db.update("UPDATE site SET status='INACTIVE'");
        assertThatThrownBy(()->transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"STOPPED\",\"manufacturingVersionId\":\""+version+"\",\"quantity\":1}")))).hasMessageContaining("工厂");
        assertThatThrownBy(()->command(module,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"C1\"}")).hasMessageContaining("工厂");
        assertThat(service.trace(module,1L).at("/object/id").asText()).isEqualTo(module);
        assertThat(service.execution(1L,module,null,1L).path("visits").size()).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM pack_assembly_link",Integer.class)).isZero();
    }
    @Test void packAuditSnapshotsUseTheExistingAuditHashContract() {
        transaction(()->service.saveManufacturing(null,manufacturing()));
        var event=db.queryForObject("SELECT * FROM audit_event",(rs,index)->com.zencas.edhr.compliance.entity.AuditEvent.builder()
            .id(rs.getLong("id")).tenantId(rs.getString("tenant_id")).entityType(rs.getString("entity_type")).entityId(rs.getString("entity_id")).action(rs.getString("action"))
            .contentBefore(rs.getString("content_before")).contentAfter(rs.getString("content_after")).snapshotHash(rs.getString("snapshot_hash"))
            .operatorId(rs.getString("operator_id")).operatorName(rs.getString("operator_name")).operatorAccount(rs.getString("operator_account")).source(rs.getString("source"))
            .moduleName(rs.getString("module_name")).menuName(rs.getString("menu_name")).functionName(rs.getString("function_name")).dataSummary(rs.getString("data_summary"))
            .reason(rs.getString("reason")).ipAddress(rs.getString("ip_address")).createdAt(rs.getTimestamp("created_at").toLocalDateTime()).build());
        assertThat(event.getSnapshotHash()).isEqualTo(event.computeSnapshotHash());
    }
    @Test void invalidReworkTargetDoesNotSuspendTheVisitOrCreateAnUnusableTask() {
        String module=module();command(module,"CHECK_IN","{\"nodeId\":\"assemble\"}");command(module,"HOLD","{\"reason\":\"未装件异常检查\"}");
        String visit=service.execution(1L,module,null,1L).at("/visit/id").asText();
        assertThatThrownBy(()->command(module,"AUTHORIZE_REWORK","{\"reason\":\"无件可拆\",\"targetNodeId\":\"assemble\",\"targetStationId\":1}")).hasMessageContaining("已装");
        assertThat(service.execution(1L,module,null,1L).at("/visit/id").asText()).isEqualTo(visit);
        assertThat(service.execution(1L,module,null,1L).at("/object/qualityState").asText()).isEqualTo("HOLD");
        assertThat(db.queryForObject("SELECT count(*) FROM pack_rework_order",Integer.class)).isZero();
    }
    @Test void ngPersistsThenBlocksAndReplacementInvalidatesOldPassUntilRetestAndIndependentRelease() {
        String module=module();object("C1","CELL","10",null);object("C2","CELL","10",null);
        command(module,"CHECK_IN","{\"nodeId\":\"assemble\"}");command(module,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"C1\"}");
        command(module,"RECORD_TEST","{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}");
        command(module,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":\"2.9\",\"unit\":\"V\"}]}");
        assertThat(service.execution(1L,module,null,1L).at("/object/qualityState").asText()).isEqualTo("HOLD");
        assertThat(service.execution(1L,module,null,1L).at("/allowedActions/CHECK_IN").asBoolean()).isFalse();
        assertThatThrownBy(()->command(module,"COMPLETE_VISIT","{}")).hasMessageContaining("质量");
        var authorization=command(module,"AUTHORIZE_REWORK","{\"reason\":\"换芯后重新检测\",\"targetNodeId\":\"assemble\",\"targetStationId\":1}");String rework=authorization.at("/result/id").asText();
        assertThatThrownBy(()->command(module,"HOLD","{\"reason\":\"重复人工锁定\"}")).hasMessageContaining("返修");
        assertThat(service.execution(1L,module,null,1L).at("/object/qualityState").asText()).isEqualTo("REWORK");
        command(module,"CHECK_IN","{\"nodeId\":\"assemble\"}");
        command(module,"REPLACE","{\"reworkId\":\""+rework+"\",\"slotCode\":\"C1\",\"childCode\":\"C2\",\"reason\":\"换芯\",\"removedDisposition\":\"QUARANTINE\"}");
        assertThatThrownBy(()->command(module,"CLOSE_REWORK","{\"reworkId\":\""+rework+"\"}")).hasMessageContaining("复测");
        command(module,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":\"2.8\",\"unit\":\"V\"}]}");
        assertThat(service.execution(1L,module,null,1L).at("/object/qualityState").asText()).isEqualTo("REWORK");
        command(module,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":\"3.7\",\"unit\":\"V\"}]}");
        command(module,"RECORD_TEST","{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}");
        command(module,"COMPLETE_VISIT","{}");command(module,"CLOSE_REWORK","{\"reworkId\":\""+rework+"\"}");
        assertThat(service.execution(1L,module,null,1L).at("/object/qualityState").asText()).isEqualTo("PENDING");
        command(module,"RELEASE","{\"reason\":\"复测齐套，独立放行\"}");
        assertThat(service.execution(1L,module,null,1L).at("/allowedActions/CHECK_IN").asBoolean()).isFalse();
        var trace=service.trace(module,1L);assertThat(trace.path("historyLinks").size()).isEqualTo(2);assertThat(trace.path("releases").size()).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM pack_test_run WHERE mes_result='FAIL'",Integer.class)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT count(*) FROM pack_test_run WHERE valid_evidence=FALSE",Integer.class)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event",Integer.class)).isGreaterThan(10);
    }
    @Test void replayReturnsOriginalResultAndSameKeyDifferentPayloadCannotRepeatBinding() {
        String module=module();String cell=object("C1","CELL","10",null);command(module,"CHECK_IN","{\"nodeId\":\"assemble\"}");
        ObjectNode payload=json("{\"slotCode\":\"C1\",\"childCode\":\"C1\"}");String key="stable-bind";
        long revision=service.execution(1L,module,null,1L).path("revision").asLong();
        ObjectNode body=json("{\"siteId\":1,\"stationId\":1}").put("objectId",module).put("revision",revision).put("requestId",key).put("action","BIND");body.set("payload",payload);
        var first=transaction(()->service.command(body));var repeated=transaction(()->service.command(body));assertThat(repeated.toString()).isEqualTo(first.toString());
        body.withObject("/payload").put("childCode","OTHER");assertThatThrownBy(()->transaction(()->service.command(body))).hasMessageContaining("请求");
        assertThat(db.queryForObject("SELECT count(*) FROM pack_assembly_link",Integer.class)).isEqualTo(1);
        assertThat(service.trace(cell,1L).path("currentParents").get(0).path("parentId").asText()).isEqualTo(module);
    }
    @Test void concurrentParentsCannotConsumeTheSameCellAndLosingTransactionHasNoPartialFacts() throws Exception {
        String version=published();String order=transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"TWO\",\"manufacturingVersionId\":\""+version+"\",\"quantity\":2}"))).path("id").asText();
        transaction(()->service.acceptOrder(order,json("{\"siteId\":1,\"stationId\":1,\"revision\":1}")));
        String first=object("M1","MODULE","20",order),second=object("M2","MODULE","20",order);object("ONLY-CELL","CELL","10",null);
        command(first,"CHECK_IN","{\"nodeId\":\"assemble\"}");command(second,"CHECK_IN","{\"nodeId\":\"assemble\"}");
        var start=new java.util.concurrent.CountDownLatch(1);var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
        try {var work=new java.util.ArrayList<java.util.concurrent.Future<Boolean>>();for(String parent:new String[]{first,second})work.add(pool.submit(()->{start.await();try{command(parent,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"ONLY-CELL\"}");return true;}catch(BusinessException failure){return false;}}));start.countDown();int successes=0;for(var result:work)if(result.get())successes++;assertThat(successes).isEqualTo(1);}finally{pool.shutdownNow();}
        assertThat(db.queryForObject("SELECT count(*) FROM pack_assembly_link",Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM pack_material_transaction",Integer.class)).isEqualTo(1);
    }
    @Test void completedModuleCanEnterPackAndFrozenDeliveryPreservesTwoLevelGenealogy() {
        String module=module();String cell=object("CELL-A","CELL","10",null);
        command(module,"CHECK_IN","{\"nodeId\":\"assemble\"}");command(module,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"CELL-A\"}");
        command(module,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":\"3.6\",\"unit\":\"V\"}]}");command(module,"RECORD_TEST","{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}");command(module,"COMPLETE_VISIT","{}");command(module,"RELEASE","{\"reason\":\"模组检验齐套\"}");
        ObjectNode config=manufacturing().put("code","PACK").put("name","PACK制造版").put("productId","30").put("outputType","PACK");ObjectNode bom=(ObjectNode)config.path("bom").get(0);bom.put("slotCode","M1").put("materialId","20").put("childType","MODULE");((ObjectNode)config.path("operations").get(0).path("actions").get(0)).putArray("slotCodes").add("M1");
        String version=transaction(()->service.saveManufacturing(null,config)).path("id").asText();transaction(()->service.publish(version,json("{\"siteId\":1,\"revision\":1}")));
        String order=transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"PACK-WO\",\"manufacturingVersionId\":\""+version+"\",\"quantity\":1}"))).path("id").asText();transaction(()->service.acceptOrder(order,json("{\"siteId\":1,\"stationId\":1,\"revision\":1}")));String pack=object("P1","PACK","30",order);
        command(pack,"CHECK_IN","{\"nodeId\":\"assemble\"}");command(pack,"BIND","{\"slotCode\":\"M1\",\"childCode\":\"M1\"}");command(pack,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":3.8,\"unit\":\"V\"}]}");command(pack,"RECORD_TEST","{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}");command(pack,"COMPLETE_VISIT","{}");var released=command(pack,"RELEASE","{\"reason\":\"PACK齐套独立质量放行\"}");
        String releaseId=released.at("/result/id").asText();JsonNode frozen=service.releaseSnapshot(releaseId,1L).path("snapshot");
        assertThat(frozen.at("/currentChildren/0/child/currentChildren/0/child/object/id").asText()).isEqualTo(cell);
        assertThat(service.trace(module,1L).at("/currentParents/0/parentId").asText()).isEqualTo(pack);
        command(pack,"HOLD","{\"reason\":\"交付后质量核查\"}");
        assertThat(service.quality(1L,"",1,1,"todo").path("totalElements").asInt()).isEqualTo(1);
        assertThat(service.quality(1L,"",1,1,"todo").at("/content/0/id").asText()).isEqualTo(pack);
        assertThat(service.quality(1L,"",1,1,"released").path("totalElements").asInt()).isEqualTo(1);
        assertThat(service.quality(1L,"",1,1,"released").at("/content/0/id").asText()).isEqualTo(module);
        assertThat(service.releaseSnapshot(releaseId,1L).path("snapshot").toString()).isEqualTo(frozen.toString());
        assertThat(service.statistics(1L).at("/PACK/completed").asInt()).isEqualTo(1);
        command(pack,"AUTHORIZE_REWORK","{\"reason\":\"PACK受控返修\",\"targetNodeId\":\"assemble\",\"targetStationId\":1}");
        String suspendedParentVisit=command(pack,"CHECK_IN","{\"nodeId\":\"assemble\"}").at("/result/id").asText();
        command(module,"HOLD","{\"reason\":\"子模组新增质量异常\"}");
        assertThat(service.execution(1L,pack,null,1L).at("/object/qualityState").asText()).isEqualTo("REWORK");
        assertThat(service.execution(1L,pack,null,1L).path("visit").isNull()).isTrue();
        assertThat(db.queryForObject("SELECT status FROM pack_visit WHERE id=?",String.class,suspendedParentVisit)).isEqualTo("SUSPENDED");
        assertThat(service.execution(1L,pack,null,1L).path("activeRework").isObject()).isTrue();
        assertThat(db.queryForObject("SELECT count(*) FROM pack_test_run WHERE object_id=? AND valid_evidence=TRUE",Integer.class,pack)).isZero();
        assertThat(command(pack,"CHECK_IN","{\"nodeId\":\"assemble\"}").at("/result/id").asText()).isNotEqualTo(suspendedParentVisit);
    }
    @Test void onlyAuthenticatedDeviceMaySubmitDeviceEvidenceAndDeviceNgCannotBeHiddenByPassingMeasurements() {
        db.update("UPDATE pack_workstation SET execution_mode='SEMI_AUTO' WHERE id=1");
        ObjectNode config=manufacturing();ObjectNode op=(ObjectNode)config.path("operations").get(0);op.put("mode","SEMI_AUTO");((ObjectNode)op.path("actions").get(1)).put("source","DEVICE");
        var version=transaction(()->service.saveManufacturing(null,config));String versionId=version.path("id").asText();transaction(()->service.publish(versionId,json("{\"siteId\":1,\"revision\":1}")));
        String order=transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"DEVICE-WO\",\"manufacturingVersionId\":\""+versionId+"\",\"quantity\":1}"))).path("id").asText();
        transaction(()->service.acceptOrder(order,json("{\"siteId\":1,\"stationId\":1,\"revision\":1}")));String module=object("DM","MODULE","20",order);object("DC","CELL","10",null);
        command(module,"CHECK_IN","{\"nodeId\":\"assemble\"}");command(module,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"DC\"}");
        assertThatThrownBy(()->command(module,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":3.7,\"unit\":\"V\"}]}" )).hasMessageContaining("来源");
        when(scope.actorType()).thenReturn("DEVICE");when(scope.actorId()).thenReturn("device-1");
        ObjectNode event=json("{\"siteId\":1,\"stationId\":1,\"sourceId\":\"device-1\",\"messageId\":\"msg-1\",\"externalRunId\":\"run-1\",\"eventType\":\"TEST_RESULT\",\"actionCode\":\"measure\",\"deviceResult\":\"FAIL\",\"values\":[{\"code\":\"V\",\"value\":\"3.700\",\"unit\":\"V\"}]}").put("objectId",module).put("revision",service.execution(1L,module,null,1L).path("revision").asLong());
        var first=transaction(()->service.deviceEvent(event));assertThat(first.path("status").asText()).isEqualTo("ACCEPTED");assertThat(first.at("/result/mesResult").asText()).isEqualTo("FAIL");
        assertThat(transaction(()->service.deviceEvent(event))).isEqualTo(first);
        ((ObjectNode)event.path("values").get(0)).put("value","3.8");assertThat(transaction(()->service.deviceEvent(event)).path("status").asText()).isEqualTo("CONFLICT");
        assertThat(db.queryForObject("SELECT count(*) FROM pack_test_run",Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM pack_inbox_conflict",Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT quality_state FROM pack_object WHERE id=?",String.class,module)).isEqualTo("HOLD");
    }
    @Test void explicitSimulationIsRejectedForEverySourceAndCannotAuthorizeProductionRelease() {
        db.update("UPDATE pack_workstation SET execution_mode='SEMI_AUTO' WHERE id=1");
        ObjectNode config=manufacturing();ObjectNode op=(ObjectNode)config.path("operations").get(0);op.put("mode","SEMI_AUTO");((ObjectNode)op.path("actions").get(1)).put("source","DEVICE");ObjectNode mesInspect=((ObjectNode)op.path("actions").get(2)).deepCopy().put("code","mes-visual").put("source","MES");op.withArray("actions").add(mesInspect);
        String version=transaction(()->service.saveManufacturing(null,config)).path("id").asText();transaction(()->service.publish(version,json("{\"siteId\":1,\"revision\":1}")));
        String order=transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"NO-SIMULATION\",\"manufacturingVersionId\":\""+version+"\",\"quantity\":1}"))).path("id").asText();transaction(()->service.acceptOrder(order,json("{\"siteId\":1,\"stationId\":1,\"revision\":1}")));String module=object("SIM-M1","MODULE","20",order);object("SIM-C1","CELL","10",null);command(module,"CHECK_IN","{\"nodeId\":\"assemble\"}");command(module,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"SIM-C1\"}");
        long originalRevision=service.execution(1L,module,null,1L).path("revision").asLong();
        for(String source:new String[]{"DEVICE","MES"})for(String location:new String[]{"ROOT","PAYLOAD"}){
            when(scope.actorType()).thenReturn(source);when(scope.actorId()).thenReturn(source.toLowerCase()+"-sim");String message=source+"-"+location;
            ObjectNode event=json("{\"siteId\":1,\"stationId\":1,\"eventType\":\"TEST_RESULT\",\"deviceResult\":\"PASS\"}").put("sourceId",scope.actorId()).put("messageId",message).put("externalRunId",message).put("objectId",module).put("revision",originalRevision).put("actionCode",source.equals("DEVICE")?"measure":"mes-visual");event.set("values",json(source.equals("DEVICE")?"{\"values\":[{\"code\":\"V\",\"value\":\"3.700\",\"unit\":\"V\"}]}":"{\"values\":[{\"code\":\"appearance\",\"value\":true}]}").path("values"));if(location.equals("ROOT"))event.put("simulation",true);else event.putObject("payload").put("simulation",true);
            var receipt=transaction(()->service.deviceEvent(event));assertThat(receipt.path("status").asText()).isEqualTo("REJECTED");assertThat(receipt.at("/result/message").asText()).contains("模拟");assertThat(receipt.path("payload").toString()).isEqualTo(event.toString());assertThat(transaction(()->service.deviceEvent(event)).toString()).isEqualTo(receipt.toString());
        }
        when(scope.actorType()).thenReturn("HUMAN");when(scope.actorId()).thenReturn("1");
        assertThatThrownBy(()->command(module,"RECORD_TEST","{\"simulation\":true,\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}")).hasMessageContaining("模拟");
        var humanRoot=json("{\"siteId\":1,\"stationId\":1,\"action\":\"RECORD_TEST\",\"simulation\":true}").put("objectId",module).put("requestId","human-root-sim").put("revision",originalRevision);humanRoot.set("payload",json("{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}"));assertThatThrownBy(()->transaction(()->service.command(humanRoot))).hasMessageContaining("模拟");
        assertThat(db.queryForObject("SELECT count(*) FROM pack_test_run",Integer.class)).isZero();assertThat(db.queryForObject("SELECT count(*) FROM pack_inbox_message WHERE status='REJECTED'",Integer.class)).isEqualTo(4);assertThat(service.execution(1L,module,null,1L).path("revision").asLong()).isEqualTo(originalRevision);
        command(module,"RECORD_TEST","{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}");
        for(String source:new String[]{"DEVICE","MES"}){
            when(scope.actorType()).thenReturn(source);when(scope.actorId()).thenReturn(source.toLowerCase()+"-real");ObjectNode event=json("{\"siteId\":1,\"stationId\":1,\"eventType\":\"TEST_RESULT\",\"deviceResult\":\"PASS\"}").put("sourceId",scope.actorId()).put("messageId",source+"-real").put("externalRunId",source+"-real").put("objectId",module).put("revision",service.execution(1L,module,null,1L).path("revision").asLong()).put("actionCode",source.equals("DEVICE")?"measure":"mes-visual");event.set("values",json(source.equals("DEVICE")?"{\"values\":[{\"code\":\"V\",\"value\":\"3.700\",\"unit\":\"V\"}]}":"{\"values\":[{\"code\":\"appearance\",\"value\":true}]}").path("values"));assertThat(transaction(()->service.deviceEvent(event)).path("status").asText()).isEqualTo("ACCEPTED");
        }
        when(scope.actorType()).thenReturn("HUMAN");when(scope.actorId()).thenReturn("1");command(module,"COMPLETE_VISIT","{}");
        db.update("UPDATE pack_test_run SET simulation=TRUE WHERE action_code='measure'");
        assertThatThrownBy(()->command(module,"RELEASE","{\"reason\":\"模拟证据不允许正式放行\"}")).hasMessageContaining("未通过");assertThat(db.queryForObject("SELECT count(*) FROM pack_release_record",Integer.class)).isZero();
    }
    @Test void externalMesOwnsItsStationWhileHumanWorkspaceRemainsReadOnly() {
        db.update("UPDATE pack_workstation SET execution_mode='EXTERNAL_MES' WHERE id=1");
        ObjectNode config=manufacturing();
        ObjectNode op=(ObjectNode)config.path("operations").get(0);op.put("mode","EXTERNAL_MES");
        var actions=op.withArray("actions");JsonNode assemble=actions.get(0).deepCopy(),inspect=actions.get(2).deepCopy();actions.removeAll();((ObjectNode)assemble).put("source","MES");((ObjectNode)inspect).put("source","MES");actions.add(assemble).add(inspect);
        String version=transaction(()->service.saveManufacturing(null,config)).path("id").asText();transaction(()->service.publish(version,json("{\"siteId\":1,\"revision\":1}")));
        String order=transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"MES-WO\",\"manufacturingVersionId\":\""+version+"\",\"quantity\":1}"))).path("id").asText();
        transaction(()->service.acceptOrder(order,json("{\"siteId\":1,\"stationId\":1,\"revision\":1}")));String module=object("EXTERNAL-M1","MODULE","20",order);object("EXTERNAL-C1","CELL","10",null);
        assertThat(service.execution(1L,module,null,1L).at("/allowedActions/CHECK_IN").asBoolean()).isFalse();
        when(scope.actorType()).thenReturn("MES");when(scope.actorId()).thenReturn("mes-1");
        var entered=json("{\"siteId\":1,\"stationId\":1,\"sourceId\":\"mes-1\",\"messageId\":\"in\",\"eventType\":\"CHECK_IN\",\"nodeId\":\"assemble\",\"revision\":1}").put("objectId",module);
        assertThat(transaction(()->service.deviceEvent(entered)).path("status").asText()).isEqualTo("ACCEPTED");
        var assembled=json("{\"siteId\":1,\"stationId\":1,\"sourceId\":\"mes-1\",\"messageId\":\"bind\",\"eventType\":\"BIND\",\"slotCode\":\"C1\",\"childCode\":\"EXTERNAL-C1\",\"revision\":2}").put("objectId",module);
        assertThat(transaction(()->service.deviceEvent(assembled)).path("status").asText()).isEqualTo("ACCEPTED");
        var tested=json("{\"siteId\":1,\"stationId\":1,\"sourceId\":\"mes-1\",\"messageId\":\"inspect\",\"externalRunId\":\"inspect-1\",\"eventType\":\"TEST_RESULT\",\"actionCode\":\"visual\",\"deviceResult\":\"PASS\",\"values\":[{\"code\":\"appearance\",\"value\":true}],\"revision\":3}").put("objectId",module);
        assertThat(transaction(()->service.deviceEvent(tested)).path("status").asText()).isEqualTo("ACCEPTED");
        when(scope.actorType()).thenReturn("HUMAN");when(scope.actorId()).thenReturn("1");
        assertThat(service.execution(1L,module,null,1L).path("blockers")).isEmpty();
        assertThat(service.execution(1L,module,null,1L).at("/allowedActions/COMPLETE_VISIT").asBoolean()).isFalse();
        assertThatThrownBy(()->command(module,"COMPLETE_VISIT","{}")).hasMessageContaining("MES");
    }
    @Test void downstreamNgSuspendsOriginalVisitThenRepairsUpstreamAndRetestsAtTheRequiredStation() {
        db.update("INSERT INTO route_node VALUES(103,101,'test','检测','OPERATION',2)");
        db.update("INSERT INTO route_relation VALUES(104,101,'assemble','test',NULL)");
        db.update("INSERT INTO pack_workstation VALUES(2,1,1,'TEST','检测站','ACTIVE','MANUAL',1,1)");
        ObjectNode config=manufacturing();ObjectNode assemble=(ObjectNode)config.path("operations").get(0);JsonNode measure=assemble.path("actions").get(1).deepCopy(),visual=assemble.path("actions").get(2).deepCopy(),bind=assemble.path("actions").get(0).deepCopy();assemble.withArray("actions").removeAll().add(bind);
        ObjectNode test=assemble.deepCopy().put("nodeId","test").put("name","检测");test.putArray("stationIds").add("2");test.putArray("actions").add(measure).add(visual);config.withArray("operations").add(test);
        String version=transaction(()->service.saveManufacturing(null,config)).path("id").asText();transaction(()->service.publish(version,json("{\"siteId\":1,\"revision\":1}")));
        String order=transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"MULTI-REWORK\",\"manufacturingVersionId\":\""+version+"\",\"quantity\":1}"))).path("id").asText();transaction(()->service.acceptOrder(order,json("{\"siteId\":1,\"stationId\":1,\"revision\":1}")));
        String module=object("MULTI-M1","MODULE","20",order);object("MULTI-C1","CELL","10",null);object("MULTI-SPARE","CELL","10",null);
        commandAt(module,1,"CHECK_IN","{\"nodeId\":\"assemble\"}");commandAt(module,1,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"MULTI-C1\"}");commandAt(module,1,"COMPLETE_VISIT","{}");
        commandAt(module,2,"CHECK_IN","{\"nodeId\":\"test\"}");commandAt(module,2,"RECORD_TEST","{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}");commandAt(module,2,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":\"2.9\",\"unit\":\"V\"}]}");
        String origin=service.execution(1L,module,null,2L).at("/visit/id").asText();
        assertThatThrownBy(()->commandAt(module,2,"AUTHORIZE_REWORK","{\"reason\":\"缺目标\"}")).hasMessageContaining("targetNodeId");
        assertThatThrownBy(()->commandAt(module,2,"AUTHORIZE_REWORK","{\"reason\":\"错误目标工位\",\"targetNodeId\":\"assemble\",\"targetStationId\":2}")).hasMessageContaining("目标");
        var authorized=commandAt(module,2,"AUTHORIZE_REWORK","{\"reason\":\"检测NG，退装配换芯\",\"targetNodeId\":\"assemble\",\"targetStationId\":1}");String rework=authorized.at("/result/id").asText();
        assertThat(authorized.at("/result/originVisitId").asText()).isEqualTo(origin);
        assertThat(authorized.at("/execution/visit").isNull()).isTrue();
        assertThat(db.queryForObject("SELECT status FROM pack_visit WHERE id=?",String.class,origin)).isEqualTo("SUSPENDED");
        assertThatThrownBy(()->commandAt(module,2,"CHECK_IN","{\"nodeId\":\"test\"}")).hasMessageContaining("目标");
        commandAt(module,1,"CHECK_IN","{\"nodeId\":\"assemble\"}");
        assertThat(service.execution(1L,module,null,1L).at("/visit/reworkOrderId").asText()).isEqualTo(rework);
        commandAt(module,1,"REPLACE","{\"reworkId\":\""+rework+"\",\"slotCode\":\"C1\",\"childCode\":\"MULTI-SPARE\",\"reason\":\"检测后换芯\",\"removedDisposition\":\"QUARANTINE\"}");
        assertThatThrownBy(()->commandAt(module,1,"CLOSE_REWORK","{\"reworkId\":\""+rework+"\"}")).hasMessageContaining("复测");
        assertThatThrownBy(()->commandAt(module,2,"CHECK_IN","{\"nodeId\":\"test\"}")).hasMessageContaining("访问");
        commandAt(module,1,"COMPLETE_VISIT","{}");
        assertThat(service.execution(1L,module,null,2L).at("/activeRework/allowedTargets/0/nodeId").asText()).isEqualTo("test");
        commandAt(module,2,"CHECK_IN","{\"nodeId\":\"test\"}");commandAt(module,2,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":\"3.7\",\"unit\":\"V\"}]}");commandAt(module,2,"RECORD_TEST","{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}");
        commandAt(module,2,"CLOSE_REWORK","{\"reworkId\":\""+rework+"\"}");commandAt(module,2,"COMPLETE_VISIT","{}");commandAt(module,2,"RELEASE","{\"reason\":\"跨工序复测完成，质量放行\"}");
        var context=service.execution(1L,module,null,2L);assertThat(context.at("/object/qualityState").asText()).isEqualTo("ACCEPTED");assertThat(context.path("visits").size()).isEqualTo(4);
        assertThat(db.queryForObject("SELECT count(*) FROM pack_visit WHERE active_key=1",Integer.class)).isZero();assertThat(db.queryForObject("SELECT count(*) FROM pack_test_run WHERE valid_evidence=FALSE",Integer.class)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT status FROM pack_visit WHERE id=?",String.class,origin)).isEqualTo("SUSPENDED");assertThat(service.trace(module,1L).path("historyLinks").size()).isEqualTo(2);
    }

    String routedModule() {return routedModule(false);}
    String routedModule(boolean inspectionFirst) {
        db.update("INSERT INTO route_node VALUES(103,101,'inspect','连接检查','OPERATION',2),(104,101,'test','终检','OPERATION',3)");
        db.update("INSERT INTO route_relation VALUES(105,101,'assemble','inspect',NULL),(106,101,'inspect','test',NULL)");
        if(inspectionFirst){db.update("UPDATE route_relation SET source_node_key='inspect',target_node_key='assemble' WHERE id=105");db.update("UPDATE route_relation SET source_node_key='assemble' WHERE id=106");}
        db.update("INSERT INTO pack_workstation VALUES(2,1,1,'INSPECT','检查站','ACTIVE','MANUAL',1,1),(3,1,1,'TEST','终检站','ACTIVE','MANUAL',1,1)");
        ObjectNode config=manufacturing(),first=(ObjectNode)config.path("operations").get(0);
        JsonNode measure=first.path("actions").get(1).deepCopy(),visual=first.path("actions").get(2).deepCopy(),bind=first.path("actions").get(0).deepCopy();
        first.putArray("actions").add(bind);
        ObjectNode inspect=first.deepCopy().put("nodeId","inspect").put("name","连接检查");inspect.putArray("stationIds").add("2");inspect.putArray("actions").add(visual);
        ObjectNode test=first.deepCopy().put("nodeId","test").put("name","终检");test.putArray("stationIds").add("3");test.putArray("actions").add(measure);
        config.withArray("operations").add(inspect).add(test);
        String version=transaction(()->service.saveManufacturing(null,config)).path("id").asText();
        transaction(()->service.publish(version,json("{\"siteId\":1,\"revision\":1}")));
        String order=transaction(()->service.createOrder(json("{\"siteId\":1,\"orderNo\":\"ROUTED\",\"manufacturingVersionId\":\""+version+"\",\"quantity\":1}"))).path("id").asText();
        transaction(()->service.acceptOrder(order,json("{\"siteId\":1,\"stationId\":1,\"revision\":1}")));
        return object("ROUTED-M1","MODULE","20",order);
    }
    JsonNode operationState(String object,long station,String node) {
        for(JsonNode state:service.execution(1L,object,null,station).path("operationStates"))if(node.equals(state.path("nodeId").asText()))return state;
        throw new AssertionError("missing operation state: "+node);
    }
    @Test void normalProductionRejectsSkippingAndReturningWithoutChangingFacts() {
        String module=routedModule();object("ROUTED-C1","CELL","10",null);
        long revision=service.execution(1L,module,null,1L).path("revision").asLong();
        assertThatThrownBy(()->commandAt(module,3,"CHECK_IN","{\"nodeId\":\"test\"}")).hasMessageContaining("前序");
        assertThat(service.execution(1L,module,null,1L).path("revision").asLong()).isEqualTo(revision);
        assertThat(db.queryForObject("SELECT count(*) FROM pack_visit",Integer.class)).isZero();
        commandAt(module,1,"CHECK_IN","{\"nodeId\":\"assemble\"}");commandAt(module,1,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"ROUTED-C1\"}");commandAt(module,1,"COMPLETE_VISIT","{}");
        revision=service.execution(1L,module,null,1L).path("revision").asLong();
        int receipts=db.queryForObject("SELECT count(*) FROM pack_command_receipt",Integer.class),audits=db.queryForObject("SELECT count(*) FROM audit_event",Integer.class);
        assertThatThrownBy(()->commandAt(module,1,"CHECK_IN","{\"nodeId\":\"assemble\"}")).hasMessageContaining("返修授权");
        assertThat(service.execution(1L,module,null,1L).path("revision").asLong()).isEqualTo(revision);
        assertThat(db.queryForObject("SELECT count(*) FROM pack_visit",Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM pack_command_receipt",Integer.class)).isEqualTo(receipts);
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event",Integer.class)).isEqualTo(audits);
    }
    @Test void workbenchStatesExplainTheSameGuardsThatRejectCommands() {
        String module=routedModule();object("ROUTED-C1","CELL","10",null);
        assertThat(operationState(module,1,"assemble").path("canCheckIn").asBoolean()).isTrue();
        assertThat(operationState(module,3,"test").path("blockers").toString()).contains("前序","连接检查");
        assertThat(operationState(module,2,"assemble").path("blockers").toString()).contains("工位");
        assertThat(service.execution(1L,module,null,null).at("/allowedActions/CHECK_IN").asBoolean()).isFalse();
        commandAt(module,1,"CHECK_IN","{\"nodeId\":\"assemble\"}");
        assertThat(operationState(module,1,"assemble").path("status").asText()).isEqualTo("RUNNING");
        assertThat(operationState(module,1,"assemble").path("blockers")).isEmpty();
        assertThat(operationState(module,2,"inspect").path("blockers").toString()).contains("访问");
        commandAt(module,1,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"ROUTED-C1\"}");commandAt(module,1,"COMPLETE_VISIT","{}");
        assertThat(operationState(module,1,"assemble").path("status").asText()).isEqualTo("COMPLETED");
        assertThat(operationState(module,1,"assemble").path("blockers").toString()).contains("返修授权");
        assertThat(operationState(module,2,"inspect").path("status").asText()).isEqualTo("EXECUTABLE");
        assertThat(operationState(module,3,"test").path("canCheckIn").asBoolean()).isFalse();
        doThrow(new org.springframework.security.access.AccessDeniedException("无操作权限")).when(scope).requirePermission("pack.execution.operate");
        assertThat(operationState(module,2,"inspect").path("blockers").toString()).contains("权限");
    }
    @Test void authorizedReturnAndRetestsFollowTheRouteUsingCurrentReworkVisits() {
        String module=routedModule();object("ROUTED-C1","CELL","10",null);object("ROUTED-SPARE","CELL","10",null);
        commandAt(module,1,"CHECK_IN","{\"nodeId\":\"assemble\"}");commandAt(module,1,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"ROUTED-C1\"}");commandAt(module,1,"COMPLETE_VISIT","{}");
        commandAt(module,2,"CHECK_IN","{\"nodeId\":\"inspect\"}");commandAt(module,2,"RECORD_TEST","{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}");commandAt(module,2,"COMPLETE_VISIT","{}");
        commandAt(module,3,"CHECK_IN","{\"nodeId\":\"test\"}");commandAt(module,3,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":\"2.9\",\"unit\":\"V\"}]}");
        var authorized=commandAt(module,3,"AUTHORIZE_REWORK","{\"reason\":\"回装配换芯\",\"targetNodeId\":\"assemble\",\"targetStationId\":1}");String rework=authorized.at("/result/id").asText();
        assertThat(operationState(module,1,"assemble").path("canCheckIn").asBoolean()).isTrue();
        commandAt(module,1,"CHECK_IN","{\"nodeId\":\"assemble\"}");
        commandAt(module,1,"REPLACE","{\"reworkId\":\""+rework+"\",\"slotCode\":\"C1\",\"childCode\":\"ROUTED-SPARE\",\"reason\":\"换芯\",\"removedDisposition\":\"QUARANTINE\"}");commandAt(module,1,"COMPLETE_VISIT","{}");
        assertThatThrownBy(()->commandAt(module,3,"CHECK_IN","{\"nodeId\":\"test\"}")).hasMessageContaining("前序");
        assertThat(operationState(module,3,"test").path("blockers").toString()).contains("连接检查");
        commandAt(module,2,"CHECK_IN","{\"nodeId\":\"inspect\"}");commandAt(module,2,"RECORD_TEST","{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}");commandAt(module,2,"COMPLETE_VISIT","{}");
        assertThat(operationState(module,3,"test").path("canCheckIn").asBoolean()).isTrue();
        commandAt(module,3,"CHECK_IN","{\"nodeId\":\"test\"}");commandAt(module,3,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":\"3.7\",\"unit\":\"V\"}]}");
        commandAt(module,3,"CLOSE_REWORK","{\"reworkId\":\""+rework+"\"}");commandAt(module,3,"COMPLETE_VISIT","{}");
        assertThat(service.execution(1L,module,null,3L).at("/object/productionState").asText()).isEqualTo("COMPLETED");
    }
    @Test void publishingRejectsDisconnectedGraphAndLeavesDraftUnfrozen() {
        db.update("INSERT INTO route_node VALUES(103,101,'orphan','遗漏连线工序','OPERATION',2)");
        ObjectNode config=manufacturing();ObjectNode orphan=config.path("operations").get(0).deepCopy();orphan.put("nodeId","orphan");config.withArray("operations").add(orphan);
        String id=transaction(()->service.saveManufacturing(null,config)).path("id").asText();
        assertThat(service.validateManufacturing(id,1L).path("valid").asBoolean()).isFalse();
        assertThatThrownBy(()->transaction(()->service.publish(id,json("{\"siteId\":1,\"revision\":1}")))).hasMessageContaining("路线");
        assertThat(service.manufacturing(id,1L).path("status").asText()).isEqualTo("DRAFT");
        assertThat(service.manufacturing(id,1L).path("frozen").isNull()).isTrue();
    }


    @Test void authorizedRepairCanStartAfterHistoricalPreInspectionThenRetestsInRouteOrder() {
        String module=routedModule(true);object("ROUTED-C1","CELL","10",null);object("ROUTED-SPARE","CELL","10",null);
        commandAt(module,2,"CHECK_IN","{\"nodeId\":\"inspect\"}");commandAt(module,2,"RECORD_TEST","{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}");commandAt(module,2,"COMPLETE_VISIT","{}");
        commandAt(module,1,"CHECK_IN","{\"nodeId\":\"assemble\"}");commandAt(module,1,"BIND","{\"slotCode\":\"C1\",\"childCode\":\"ROUTED-C1\"}");commandAt(module,1,"COMPLETE_VISIT","{}");
        commandAt(module,3,"CHECK_IN","{\"nodeId\":\"test\"}");commandAt(module,3,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":\"2.9\",\"unit\":\"V\"}]}");
        String rework=commandAt(module,3,"AUTHORIZE_REWORK","{\"reason\":\"前检后装配换芯\",\"targetNodeId\":\"assemble\",\"targetStationId\":1}").at("/result/id").asText();
        assertThat(operationState(module,1,"assemble").path("canCheckIn").asBoolean()).isTrue();
        commandAt(module,1,"CHECK_IN","{\"nodeId\":\"assemble\"}");commandAt(module,1,"REPLACE","{\"reworkId\":\""+rework+"\",\"slotCode\":\"C1\",\"childCode\":\"ROUTED-SPARE\",\"reason\":\"换芯\",\"removedDisposition\":\"QUARANTINE\"}");commandAt(module,1,"COMPLETE_VISIT","{}");
        assertThatThrownBy(()->commandAt(module,3,"CHECK_IN","{\"nodeId\":\"test\"}")).hasMessageContaining("前序");
        commandAt(module,2,"CHECK_IN","{\"nodeId\":\"inspect\"}");commandAt(module,2,"RECORD_TEST","{\"actionCode\":\"visual\",\"values\":[{\"code\":\"appearance\",\"value\":true}]}");commandAt(module,2,"COMPLETE_VISIT","{}");
        commandAt(module,3,"CHECK_IN","{\"nodeId\":\"test\"}");commandAt(module,3,"RECORD_TEST","{\"actionCode\":\"measure\",\"values\":[{\"code\":\"V\",\"value\":\"3.7\",\"unit\":\"V\"}]}");commandAt(module,3,"CLOSE_REWORK","{\"reworkId\":\""+rework+"\"}");commandAt(module,3,"COMPLETE_VISIT","{}");
        assertThat(service.execution(1L,module,null,3L).at("/object/productionState").asText()).isEqualTo("COMPLETED");
    }


    @Test void laterRouteEditsKeepExistingSnapshotsAndInvalidLegacySnapshotsCannotStart() {
        String module=routedModule();String frozen=service.execution(1L,module,null,1L).at("/object/snapshot").toString();
        db.update("DELETE FROM route_relation WHERE route_version_id=101");
        assertThat(operationState(module,1,"assemble").path("canCheckIn").asBoolean()).isTrue();
        assertThat(service.execution(1L,module,null,1L).at("/object/snapshot").toString()).isEqualTo(frozen);
        ObjectNode invalid=json(frozen);invalid.putArray("routeRelations");
        db.update("UPDATE pack_object SET snapshot_json=? WHERE id=?",invalid.toString(),module);
        assertThat(operationState(module,1,"assemble").path("canCheckIn").asBoolean()).isFalse();
        assertThatThrownBy(()->commandAt(module,1,"CHECK_IN","{\"nodeId\":\"assemble\"}")).hasMessageContaining("路线");
        assertThat(db.queryForObject("SELECT count(*) FROM pack_visit",Integer.class)).isZero();
    }

}
