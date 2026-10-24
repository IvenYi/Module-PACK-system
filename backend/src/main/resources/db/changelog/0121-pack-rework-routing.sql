--liquibase formatted sql
--changeset codex:0121-pack-rework-routing
ALTER TABLE pack_rework_order ADD COLUMN target_node_id VARCHAR(64);
ALTER TABLE pack_rework_order ADD COLUMN target_station_id BIGINT REFERENCES pack_workstation(id) ON DELETE RESTRICT;
ALTER TABLE pack_rework_order ADD COLUMN origin_visit_id BIGINT REFERENCES pack_visit(id) ON DELETE RESTRICT;
ALTER TABLE pack_visit ADD COLUMN rework_order_id BIGINT REFERENCES pack_rework_order(id) ON DELETE RESTRICT;
CREATE INDEX pack_visit_rework_idx ON pack_visit(rework_order_id,node_id,status);
