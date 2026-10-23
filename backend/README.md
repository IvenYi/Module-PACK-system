# 后端工程

本目录为 Pack MES 后端，使用Java 21、Spring Boot 3.3.0、Spring JDBC、PostgreSQL与Liquibase；采用独立数据库和模块化单体。提供系统管理、权限、主数据及R1-01制造内核，制造、装配、检验、实耗、质量及消息回执均落库，无表单/DHR/电子签名依赖。

## 构建、运行和检查

首次数据库创建、可保存的[配置模板](../.env.example)、全部配置项、旧55432临时库及日常重启见[启动与配置手册](../docs/development/local-startup.md)。需要Java 21、Maven及一个独立的PostgreSQL数据库。先创建专用数据库及用户，再在本目录设置（也可先在仓库根目录用`set -a; source .env; set +a`加载配置）：

```sh
export MES_DB_URL='jdbc:postgresql://127.0.0.1:5432/module_pack_mes'
export MES_DB_USER='mes'
export MES_DB_PASSWORD='自行设置的数据库密码'
# 使用固定内置 admin 时以下配置可留空
export MES_ADMIN_USERNAME=''
export MES_ADMIN_PASSWORD=''
export MES_ADMIN_TENANT=''
export MES_ADMIN_FACTORY=''
export MES_DEMO_ENABLED=false
mvn package
java -jar target/module-pack-mes-0.1.0-SNAPSHOT.jar
```

`mvn package`包含测试。服务默认仅监听`127.0.0.1:8080`；`MES_PORT`可调整端口，调整后须同步修改前端`vite.config.ts`中的`/api`代理并重启。`GET /api/health`返回`status=UP`和`slice=R1-01`，实际数据库/账号可用性还需登录核对。Liquibase自动迁移MES专用库，不能指向其他项目数据库。

默认关闭演示模式，启动时自动建立固定内置系统管理员 `admin / admin123`，默认租户为 T1。初始密码仅在首次创建时写入 BCrypt 哈希，重启不覆盖已修改的密码。内置账号自动管理所属租户全部工厂，其角色与启用状态受保护，不跨租户。`MES_ADMIN_TENANT` / `MES_ADMIN_FACTORY` 可指定首次范围，已有内置账号范围不变；`MES_ADMIN_USERNAME` / `MES_ADMIN_PASSWORD` 保留用于可选额外管理员，仍要求至少12字符密码。已有账号和业务事实保持原样。管理员登录后，在系统管理中维护用户、多角色、工厂授权和设备/外部MES接入账号，在主数据中配置制造资源及业务资料。

仅需使用预置夹具验证时，在独立演示库显式设置 `MES_DEMO_ENABLED=true` 及至少12字符的 `MES_DEMO_PASSWORD`。关闭开关不会删除或停用已有数据；更改该密码不会重置已有账号。正常管理与作业流程不依赖演示初始化。

登录返回不透明Bearer令牌；服务器仅保存令牌摘要，授权范围和来源取自服务端身份，每次请求重新核对。前端令牌仅保存在内存；重登不会继承前一会话未确认请求。

`mvn test`默认在独立H2测试库执行领域与HTTP接口测试，不使用上面的运行数据库。测试使用真实关系记录与事务，没有模拟成功的数据库。测试环境采用Mockito子类插件避免不必要的JVM动态挂载；当前测试没有业务Mock。

可选的预置夹具HTTP复现工具仅依赖Python标准库，仅在上述独立演示库运行：

```sh
# run要求T1-F1尚无执行事实；工具会写入明确的DEMO业务，不重置数据库
python3 scripts/verify-demo.py --phase run --evidence /tmp/r1-live-evidence.json
# 停止、重启同一后端并使用同一数据库后：
python3 scripts/verify-demo.py --phase replay --evidence /tmp/r1-live-evidence.json
```

工具从环境读取`MES_DEMO_PASSWORD`，`MES_BASE_URL`默认本机8080，只允许本机HTTP；证据不包含密码/令牌。`replay`对比持久化事实并使用原请求/业务运行补传，不把新增回执误算成新增生产。

完整命令字段、状态、复现顺序及已知限制见[实现契约](../docs/development/r1-01-implementation.md)。接口复现不代替真实设备接口、生产安全联锁、现场性能及数据库/文件/消息联合恢复验收。依赖固定为本地已验证基线，本轮未执行在线依赖安全审计。

| 目录 | 用途 |
| --- | --- |
| `src/main/java/` | 接口、领域服务、权限与集成代码 |
| `src/main/resources/` | 应用资源与配置模板 |
| `src/main/resources/db/changelog/` | MES 数据库基线与后续迁移 |
| `src/test/java/` | 领域规则、接口与集成测试 |

建立独立的 MES 数据库基线；复用鉴权、权限等基础能力时，按[逐项复用审查](../docs/architecture/edhr-reuse-audit.md)解除表单、DHR、电子签名认证依赖。设备实测原始数据、装配履历、质量判定与业务审计按 MES 领域契约设计。

开发依据：[开发与验收契约](../docs/development/contracts-and-acceptance.md)、[行业详细设计](../docs/product/pack-domain-design.md)、[功能矩阵](../docs/product/function-matrix.md)。
