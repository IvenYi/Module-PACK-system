--liquibase formatted sql
--changeset codex:0118-pack-execution-quality
CREATE TABLE pack_work_order (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL REFERENCES site(id), order_no VARCHAR(64) NOT NULL,
 manufacturing_version_id BIGINT NOT NULL REFERENCES pack_manufacturing_version(id), quantity INTEGER NOT NULL CHECK(quantity>0),
 station_id BIGINT REFERENCES pack_workstation(id) ON DELETE RESTRICT, status VARCHAR(24) NOT NULL,
 revision BIGINT NOT NULL, snapshot_json TEXT NOT NULL, created_by VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL,
 UNIQUE(tenant_id,site_id,order_no)
);
CREATE TABLE pack_object (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL REFERENCES site(id), object_no VARCHAR(64) NOT NULL,
 object_type VARCHAR(24) NOT NULL CHECK(object_type IN ('CELL','MODULE','PACK','COMPONENT')), material_id BIGINT NOT NULL REFERENCES material(id),
 work_order_id BIGINT REFERENCES pack_work_order(id), manufacturing_version_id BIGINT REFERENCES pack_manufacturing_version(id),
 snapshot_json TEXT, production_state VARCHAR(24) NOT NULL, quality_state VARCHAR(24) NOT NULL,
 assembly_revision BIGINT NOT NULL, revision BIGINT NOT NULL, supplier_batch VARCHAR(128), source_json TEXT NOT NULL,
 created_by VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL,
 UNIQUE(tenant_id,site_id,object_no)
);
CREATE TABLE pack_visit (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL, object_id BIGINT NOT NULL REFERENCES pack_object(id),
 node_id VARCHAR(64) NOT NULL, station_id BIGINT NOT NULL REFERENCES pack_workstation(id) ON DELETE RESTRICT,
 station_snapshot_json TEXT NOT NULL, kind VARCHAR(24) NOT NULL, status VARCHAR(24) NOT NULL,
 active_key SMALLINT, assembly_revision BIGINT NOT NULL, started_at TIMESTAMP NOT NULL, ended_at TIMESTAMP,
 UNIQUE(object_id,active_key)
);
CREATE TABLE pack_action_run (
 id BIGINT PRIMARY KEY, visit_id BIGINT NOT NULL REFERENCES pack_visit(id), action_code VARCHAR(64) NOT NULL,
 attempt_no INTEGER NOT NULL, state VARCHAR(24) NOT NULL, source VARCHAR(24) NOT NULL, actor_id VARCHAR(64) NOT NULL,
 assembly_revision BIGINT NOT NULL, evidence_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL,
 UNIQUE(visit_id,action_code,attempt_no)
);
CREATE TABLE pack_assembly_link (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL,
 parent_id BIGINT NOT NULL REFERENCES pack_object(id), child_id BIGINT NOT NULL REFERENCES pack_object(id),
 slot_code VARCHAR(64) NOT NULL, active_key SMALLINT, assembly_revision BIGINT NOT NULL,
 visit_id BIGINT NOT NULL REFERENCES pack_visit(id), rework_id BIGINT,
 assembled_at TIMESTAMP NOT NULL, removed_at TIMESTAMP, reason TEXT, removed_disposition VARCHAR(32),
 CHECK(parent_id<>child_id), UNIQUE(tenant_id,site_id,child_id,active_key), UNIQUE(parent_id,slot_code,active_key)
);
CREATE TABLE pack_test_run (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL,
 object_id BIGINT NOT NULL REFERENCES pack_object(id), visit_id BIGINT NOT NULL REFERENCES pack_visit(id),
 action_run_id BIGINT NOT NULL REFERENCES pack_action_run(id), action_code VARCHAR(64) NOT NULL,
 assembly_revision BIGINT NOT NULL, source VARCHAR(24) NOT NULL, source_id VARCHAR(64) NOT NULL,
 external_run_id VARCHAR(128), device_result VARCHAR(24), mes_result VARCHAR(24) NOT NULL,
 valid_evidence BOOLEAN NOT NULL, invalidated_by VARCHAR(128), simulation BOOLEAN NOT NULL,
 raw_payload_json TEXT NOT NULL, spec_snapshot_json TEXT NOT NULL, results_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL,
 UNIQUE(tenant_id,site_id,source_id,external_run_id)
);
CREATE TABLE pack_quality_hold (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL, object_id BIGINT NOT NULL REFERENCES pack_object(id),
 test_run_id BIGINT REFERENCES pack_test_run(id), reason TEXT NOT NULL, status VARCHAR(24) NOT NULL,
 created_by VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL, closed_at TIMESTAMP
);
CREATE TABLE pack_rework_order (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL, object_id BIGINT NOT NULL REFERENCES pack_object(id),
 reason TEXT NOT NULL, status VARCHAR(24) NOT NULL, required_tests_json TEXT NOT NULL, authorized_revision BIGINT NOT NULL,
 authorized_by VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL, closed_at TIMESTAMP
);
CREATE TABLE pack_release_record (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL, object_id BIGINT NOT NULL REFERENCES pack_object(id),
 assembly_revision BIGINT NOT NULL, snapshot_json TEXT NOT NULL, snapshot_hash VARCHAR(64) NOT NULL,
 reason TEXT NOT NULL, released_by VARCHAR(64) NOT NULL, released_at TIMESTAMP NOT NULL,
 UNIQUE(object_id,snapshot_hash)
);
CREATE TABLE pack_command_receipt (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL, actor_id VARCHAR(64) NOT NULL,
 request_id VARCHAR(128) NOT NULL, payload_hash VARCHAR(64) NOT NULL, result_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL,
 UNIQUE(tenant_id,site_id,actor_id,request_id)
);
CREATE TABLE pack_inbox_message (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL, source_id VARCHAR(64) NOT NULL,
 message_id VARCHAR(128) NOT NULL, payload_hash VARCHAR(64) NOT NULL, payload_json TEXT NOT NULL, status VARCHAR(24) NOT NULL,
 result_json TEXT, received_at TIMESTAMP NOT NULL, UNIQUE(tenant_id,site_id,source_id,message_id)
);
CREATE TABLE pack_material_transaction (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL, object_id BIGINT NOT NULL REFERENCES pack_object(id),
 child_id BIGINT NOT NULL REFERENCES pack_object(id), link_id BIGINT NOT NULL REFERENCES pack_assembly_link(id),
 business_key VARCHAR(128) NOT NULL, transaction_type VARCHAR(32) NOT NULL, quantity INTEGER NOT NULL CHECK(quantity=1),
 disposition VARCHAR(32), created_by VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL,
 UNIQUE(tenant_id,site_id,business_key)
);
CREATE TABLE pack_inbox_conflict (
 id BIGINT PRIMARY KEY, inbox_id BIGINT NOT NULL REFERENCES pack_inbox_message(id),
 payload_hash VARCHAR(64) NOT NULL, payload_json TEXT NOT NULL, received_at TIMESTAMP NOT NULL,
 UNIQUE(inbox_id,payload_hash)
);
CREATE INDEX pack_object_order_idx ON pack_object(work_order_id);
CREATE INDEX pack_test_object_idx ON pack_test_run(object_id,assembly_revision);
CREATE INDEX pack_link_child_history_idx ON pack_assembly_link(child_id,assembled_at);
CREATE INDEX pack_hold_object_idx ON pack_quality_hold(object_id,status);
