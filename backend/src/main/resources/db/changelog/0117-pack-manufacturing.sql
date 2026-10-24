--liquibase formatted sql
--changeset codex:0117-pack-manufacturing
CREATE TABLE pack_manufacturing_version (
 id BIGINT PRIMARY KEY, tenant_id BIGINT NOT NULL, site_id BIGINT NOT NULL REFERENCES site(id),
 product_id BIGINT NOT NULL REFERENCES material(id), route_version_id BIGINT NOT NULL REFERENCES route_version(id),
 code VARCHAR(64) NOT NULL, name VARCHAR(160) NOT NULL, version VARCHAR(64) NOT NULL,
 status VARCHAR(24) NOT NULL CHECK(status IN ('DRAFT','PUBLISHED','RETIRED')), revision BIGINT NOT NULL,
 config_json TEXT NOT NULL, frozen_json TEXT, snapshot_hash VARCHAR(64),
 created_by VARCHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL,
 UNIQUE(tenant_id,site_id,code,version)
);
CREATE TABLE pack_bom_line (
 id BIGINT PRIMARY KEY, version_id BIGINT NOT NULL REFERENCES pack_manufacturing_version(id),
 slot_code VARCHAR(64) NOT NULL, material_id BIGINT NOT NULL REFERENCES material(id), child_type VARCHAR(24) NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity=1), config_json TEXT NOT NULL, UNIQUE(version_id,slot_code)
);
CREATE TABLE pack_operation_action (
 id BIGINT PRIMARY KEY, version_id BIGINT NOT NULL REFERENCES pack_manufacturing_version(id),
 node_id VARCHAR(64) NOT NULL, action_code VARCHAR(64) NOT NULL, action_type VARCHAR(32) NOT NULL,
 required_action BOOLEAN NOT NULL, config_json TEXT NOT NULL, UNIQUE(version_id,node_id,action_code)
);
CREATE TABLE pack_manufacturing_station (
 version_id BIGINT NOT NULL REFERENCES pack_manufacturing_version(id),
 station_id BIGINT NOT NULL REFERENCES pack_workstation(id) ON DELETE RESTRICT,
 PRIMARY KEY(version_id,station_id)
);
