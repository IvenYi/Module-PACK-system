# 后端工程

本目录用于模组 / PACK MES 后端。当前只有目录骨架，尚未添加 `pom.xml`、应用入口及运行配置，暂不支持构建或启动服务。

计划沿用 Java 21、Spring Boot、PostgreSQL、Liquibase 技术路线，首版采用模块化单体。具体依赖版本在工程初始化时依据 eDHR 基线核查。

| 目录 | 用途 |
| --- | --- |
| `src/main/java/` | 接口、领域服务、权限与集成代码 |
| `src/main/resources/` | 应用资源与配置模板 |
| `src/main/resources/db/changelog/` | MES 数据库基线与后续迁移 |
| `src/test/java/` | 领域规则、接口与集成测试 |

建立独立的 MES 数据库基线；复用鉴权、权限等基础能力时，按[逐项复用审查](../docs/architecture/edhr-reuse-audit.md)解除表单、DHR、电子签名认证依赖。设备实测原始数据、装配履历、质量判定与业务审计按 MES 领域契约设计。

开发依据：[开发与验收契约](../docs/development/contracts-and-acceptance.md)、[行业详细设计](../docs/product/pack-domain-design.md)、[功能矩阵](../docs/product/function-matrix.md)。
