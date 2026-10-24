# 后端工程

本目录为基于医疗套件改造的 Pack MES 后端，使用 Java 21、Spring Boot 3.3.0、Spring Data JPA/JDBC、PostgreSQL 与 Liquibase。代码与前端、脚本及产品规划同属 `Module-PACK-system` 一个仓库，当前 Maven 产物名仍为 `edhr-0.0.1-SNAPSHOT.jar`。

## 构建、运行和检查

完整环境要求及安装步骤见[本地运行说明](../docs/pack-local-setup.md)。本机运行使用独立 PostgreSQL 18 集群、Java 21 和 Node 22；后端打包会构建前端 DHR 打印资源，因此首次需先安装前端依赖。

在仓库根目录执行：

```sh
cd frontend
npm ci --no-audit --no-fund
cd ..
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home mvn -f backend/pom.xml -DskipTests package
python3 scripts/pack-local.py start
python3 scripts/pack-local.py status
python3 scripts/pack-local.py stop
```

`-DskipTests package` 只完成打包，不代表测试通过。Pack 领域与路线校验可单独运行：

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home mvn -f backend/pom.xml -Dtest=PackDomainTest,PackRouteGraphTest test
```

本地脚本使用 `127.0.0.1:8090`，独立数据库为 `127.0.0.1:55440/pack_edhr_dev`；应用用户为 `pack_edhr`。根目录 `.env.pack.local` 保存本地随机数据库密码和 JWT 密钥，`.pack-postgres/` 保存数据库，`.pack-runtime/files/` 保存业务附件。脚本显式覆盖数据源、监听地址、附件路径和运行缓存，并默认停用医疗 OCR。上述本地数据、依赖、日志和构建产物不进入 Git。

首次内置管理员为 `admin / admin123`，已有账号使用当前密码。Pack 请求由服务端用户、角色和工厂授权确定范围；内置管理员保护、会话撤销及权限修改生效边界见[首链实施记录](../docs/pack-first-chain-implementation.md)。

不要直接沿用医疗默认 `docker-compose.yml`、应用配置或无隔离参数的 `mvn spring-boot:run`：它们仍包含医疗项目的端口和数据源。Pack 日常启停统一使用仓库根目录的 `scripts/pack-local.py`。

## 当前实现与边界

Pack 领域包含制造版本冻结、工单与单件、受控进站、装配、数值/布尔检验、NG锁定、返修拆换与复测、质量放行、谱系与历史追溯，以及设备/MES消息的身份、幂等和冲突校验。制造完成与质量放行分别管理；当前路线只支持单一顺序链。

已记录的业务、HTTP、权限及软件流程验收见[首链实施记录](../docs/pack-first-chain-implementation.md)和[页面业务验收记录](../docs/pack-ui-business-acceptance-2026-10-24.md)。这些记录属于原实施批次，本次目录合并不表示已重新执行；真实设备协议、工艺限值、现场性能与恢复验收仍有边界。工单派工、SN及数量结案等后续规则见[业务讨论稿](../docs/pack-work-order-dispatch-and-execution-rules-2026-10-24.md)，不作为全部已实现能力。

医疗表单、DHR和签名的正式运行入口已退出，部分遗留源码、历史迁移和DHR构建依赖仍保留；当前工程不能描述为已完全移除这些依赖。旧[启动手册](../docs/development/local-startup.md)与[R1-01实现契约](../docs/development/r1-01-implementation.md)描述已删除的旧 Pack 实现，仅供历史参考，其 JAR、`MES_*` 配置及复现工具不适用于当前代码。

| 目录 | 用途 |
| --- | --- |
| `src/main/java/` | 接口、Pack领域服务、沿用管理能力、权限与集成代码 |
| `src/main/resources/` | 应用配置和 Liquibase 数据库变更 |
| `src/test/java/` | 领域、权限、接口与历史模块测试 |
| `scripts/` | 后端辅助及历史验证工具；Pack统一启停位于仓库根目录 `scripts/` |

开发依据：[改造方案](../docs/pack-adaptation-proposal-2026-10-23.md)、[开发与验收契约](../docs/development/contracts-and-acceptance.md)、[行业详细设计](../docs/product/pack-domain-design.md)、[功能矩阵](../docs/product/function-matrix.md)。
