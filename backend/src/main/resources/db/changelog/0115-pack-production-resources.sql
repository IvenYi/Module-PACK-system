--liquibase formatted sql
--changeset pack:0115-production-resources
ALTER TABLE workshop ADD COLUMN IF NOT EXISTS site_id BIGINT;
UPDATE workshop w SET site_id = (SELECT MIN(s.id) FROM site s WHERE s.tenant_id = w.tenant_id)
WHERE w.site_id IS NULL AND (SELECT COUNT(*) FROM site s WHERE s.tenant_id=w.tenant_id)=1;
ALTER TABLE workshop ADD CONSTRAINT fk_workshop_pack_site FOREIGN KEY (site_id) REFERENCES site(id);
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE production_line ADD COLUMN IF NOT EXISTS description VARCHAR(512);
CREATE UNIQUE INDEX IF NOT EXISTS uk_pack_line_workshop_code ON production_line(workshop_id, LOWER(code));

CREATE TABLE pack_workstation (
    id BIGINT PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenant(id),
    site_id BIGINT NOT NULL REFERENCES site(id),
    workshop_id BIGINT NOT NULL REFERENCES workshop(id),
    production_line_id BIGINT NOT NULL REFERENCES production_line(id),
    code VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    execution_mode VARCHAR(32) NOT NULL DEFAULT 'MANUAL' CHECK (execution_mode IN ('MANUAL', 'SEMI_AUTO', 'EXTERNAL_MES')),
    description VARCHAR(512),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, code)
);
CREATE INDEX ix_pack_workstation_scope ON pack_workstation(tenant_id, site_id, production_line_id);

INSERT INTO permission(id, code, name, type, parent_code, sort_order)
SELECT 115001, 'master-data.production-lines', '产线管理', 'PAGE', 'master-data', 21
WHERE NOT EXISTS (SELECT 1 FROM permission WHERE code='master-data.production-lines');
INSERT INTO permission(id, code, name, type, parent_code, sort_order)
SELECT 115002, 'master-data.workstations', '工位管理', 'PAGE', 'master-data', 22
WHERE NOT EXISTS (SELECT 1 FROM permission WHERE code='master-data.workstations');
INSERT INTO role_permission(id, role_id, permission_id)
SELECT 115100 + ROW_NUMBER() OVER (ORDER BY r.id,p.id), r.id, p.id FROM role r CROSS JOIN permission p
WHERE r.code='ADMIN' AND p.code IN ('master-data.sites', 'master-data.production-lines', 'master-data.workstations', 'master-data.edit')
AND NOT EXISTS (SELECT 1 FROM role_permission rp WHERE rp.role_id=r.id AND rp.permission_id=p.id);

CREATE UNIQUE INDEX IF NOT EXISTS uk_pack_site_lower_code ON site(tenant_id,LOWER(code));
CREATE UNIQUE INDEX IF NOT EXISTS uk_pack_station_lower_code ON pack_workstation(tenant_id,LOWER(code));
