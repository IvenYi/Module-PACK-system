--liquibase formatted sql
--changeset pack:0116-identity-scope

ALTER TABLE user_account ADD COLUMN IF NOT EXISTS builtin_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_account ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'HUMAN';
UPDATE user_account SET builtin_admin = TRUE WHERE tenant_id = 1 AND LOWER(username) = 'admin';
CREATE UNIQUE INDEX IF NOT EXISTS uk_pack_builtin_admin ON user_account(builtin_admin) WHERE builtin_admin = TRUE;
ALTER TABLE user_account ADD CONSTRAINT ck_pack_user_source CHECK (source IN ('HUMAN', 'DEVICE', 'MES'));

CREATE TABLE pack_auth_session (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_pack_auth_session_user ON pack_auth_session(user_id);

CREATE TABLE pack_role_scope (
    role_id BIGINT PRIMARY KEY REFERENCES role(id) ON DELETE CASCADE,
    factory_mode VARCHAR(16) NOT NULL DEFAULT 'SELECTED' CHECK (factory_mode IN ('ALL', 'SELECTED'))
);
CREATE TABLE pack_role_factory (
    role_id BIGINT NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    factory_id BIGINT NOT NULL REFERENCES site(id) ON DELETE RESTRICT,
    PRIMARY KEY (role_id, factory_id)
);
INSERT INTO pack_role_scope(role_id, factory_mode)
SELECT id, CASE WHEN tenant_id = 1 AND code = 'ADMIN' THEN 'ALL' ELSE 'SELECTED' END FROM role;
INSERT INTO pack_role_factory(role_id, factory_id)
SELECT r.id, MIN(s.id) FROM role r JOIN site s ON s.tenant_id = r.tenant_id AND s.status = 'ACTIVE'
WHERE r.code <> 'ADMIN' GROUP BY r.id;

INSERT INTO permission(id, code, name, type, parent_code, sort_order)
SELECT v.id, v.code, v.name, v.kind, v.parent, v.rank FROM (VALUES
 (8116001, 'master-data.sites', '工厂管理', 'PAGE', 'master-data', 20),
 (8116010, 'pack.manufacturing.view', '制造版本查询', 'PAGE', 'master-data', 30),
 (8116011, 'pack.manufacturing.manage', '制造版本维护', 'BUTTON', 'pack.manufacturing.view', 1),
 (8116020, 'pack.production.view', 'Pack生产查询', 'PAGE', 'production', 30),
 (8116021, 'pack.production.manage', 'Pack工单维护', 'BUTTON', 'pack.production.view', 1),
 (8116030, 'pack.execution.view', 'Pack作业查询', 'PAGE', 'production', 31),
 (8116031, 'pack.execution.operate', 'Pack生产操作', 'BUTTON', 'pack.execution.view', 1),
 (8116040, 'pack.quality.view', 'Pack质量查询', 'PAGE', 'production', 32),
 (8116041, 'pack.quality.manage', 'Pack质量处置', 'BUTTON', 'pack.quality.view', 1),
 (8116050, 'pack.trace.view', 'Pack双向追溯', 'PAGE', 'production', 33),
 (8116060, 'pack.integration.view', 'Pack接入查询', 'PAGE', 'production', 34),
 (8116061, 'pack.integration.submit', 'Pack检测接入', 'BUTTON', 'pack.integration.view', 1)
) AS v(id, code, name, kind, parent, rank) WHERE NOT EXISTS (SELECT 1 FROM permission p WHERE p.code = v.code);

INSERT INTO role_permission(id, role_id, permission_id)
SELECT 8116100000 + ROW_NUMBER() OVER (ORDER BY r.id, p.id), r.id, p.id FROM role r CROSS JOIN permission p
WHERE p.code IN ('master-data.sites', 'pack.manufacturing.view', 'pack.manufacturing.manage', 'pack.production.view',
 'pack.production.manage', 'pack.execution.view', 'pack.execution.operate', 'pack.quality.view', 'pack.quality.manage',
 'pack.trace.view', 'pack.integration.view', 'pack.integration.submit')
AND (r.code = 'ADMIN'
 OR (r.code = 'OPERATOR' AND p.code IN ('pack.production.view','pack.execution.view','pack.execution.operate','pack.trace.view'))
 OR (r.code = 'QUALITY_MGR' AND p.code IN ('pack.production.view','pack.quality.view','pack.quality.manage','pack.trace.view')))
AND NOT EXISTS (SELECT 1 FROM role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO role(id, tenant_id, code, name, description)
SELECT 8116000000 + t.id * 2 + v.offset_id, t.id, v.code, v.name, '机器接入身份，不能执行人员操作'
FROM tenant t CROSS JOIN (VALUES (0, 'DEVICE', '设备接入'), (1, 'MES', '外部MES接入')) v(offset_id, code, name)
WHERE NOT EXISTS (SELECT 1 FROM role r WHERE r.tenant_id = t.id AND r.code = v.code);
INSERT INTO pack_role_scope(role_id, factory_mode)
SELECT r.id, 'SELECTED' FROM role r WHERE r.code IN ('DEVICE','MES')
AND NOT EXISTS (SELECT 1 FROM pack_role_scope s WHERE s.role_id = r.id);
INSERT INTO role_permission(id, role_id, permission_id)
SELECT 8216000000 + ROW_NUMBER() OVER (ORDER BY r.id, p.id), r.id, p.id FROM role r CROSS JOIN permission p
WHERE r.code IN ('DEVICE','MES') AND p.code IN ('pack.integration.view','pack.integration.submit')
AND NOT EXISTS (SELECT 1 FROM role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
