--liquibase formatted sql
--changeset pack:0120-branding
UPDATE system_setting SET system_name='Pack MES' WHERE system_name IN ('eDHR', 'eDHR 系统', 'Zencas eDHR', 'eDHR 合规管理平台');
UPDATE system_setting SET browser_title='Pack MES - 模组与PACK制造执行系统' WHERE browser_title LIKE '%eDHR%';
UPDATE system_setting SET login_subtitle='模组与 PACK 制造执行平台' WHERE login_subtitle IN ('电子设备历史记录平台', '电子器械历史记录平台');
UPDATE system_setting SET login_description='贯通电芯、模组与 PACK 的装配、检验、质量处置和制造追溯。' WHERE login_description LIKE '面向医疗器械生产的 GMP%';
UPDATE system_setting SET login_compliance_items='制造版本|受控执行
质量闭环|异常可追溯
装配谱系|双向追溯' WHERE login_compliance_items LIKE '21 CFR Part 11%';
UPDATE system_setting SET force_signature_on_first_login=FALSE, signature_change_cycle_enabled=FALSE;
