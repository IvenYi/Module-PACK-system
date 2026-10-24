--liquibase formatted sql
--changeset pack:0119-equipment-scope
-- Only infer legacy ownership when the equipment type identifies a tenant with exactly one factory.
UPDATE equipment e SET site_id = (
    SELECT MIN(s.id) FROM site s JOIN tenant t ON t.id=s.tenant_id JOIN equipment_type et ON et.id=e.equipment_type_id
    WHERE et.tenant_id=CASE WHEN t.id=1 THEN 'default' ELSE t.code END
)
WHERE e.site_id IS NULL AND (
    SELECT COUNT(*) FROM site s JOIN tenant t ON t.id=s.tenant_id JOIN equipment_type et ON et.id=e.equipment_type_id
    WHERE et.tenant_id=CASE WHEN t.id=1 THEN 'default' ELSE t.code END
)=1;
DROP INDEX IF EXISTS uk_eq_code;
CREATE UNIQUE INDEX uk_pack_equipment_site_code ON equipment(site_id,LOWER(code)) WHERE site_id IS NOT NULL;
ALTER TABLE equipment ADD CONSTRAINT fk_pack_equipment_site FOREIGN KEY(site_id) REFERENCES site(id);
