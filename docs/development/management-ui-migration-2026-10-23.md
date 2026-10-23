# 管理与生产作业界面迁移记录

日期：2026-10-23。适用仓库：`Module-PACK-system`。本记录描述本轮已写入的管理、主数据、制造配置和作业界面，以及当前验证证据；浏览器验收结果由本轮根代理在完成交互后补充。

## 1. 来源与实施原则

医疗源仓库为 [IvenYi/edhr-nexus-frontend](https://github.com/IvenYi/edhr-nexus-frontend)，采用 `edhr-dev@96ea56338ef1438938a546382368eb1d7d400938` 固定源码。源目录为 `gmp-platform/frontend/src` 与 `gmp-platform/backend/src/main/java/com/zencas/edhr`。迁移依据见[医疗套件复用与 Pack 界面差距分析](../architecture/edhr-reuse-gap-analysis-2026-10-23.md)。

本轮采用源应用壳、公共列表与弹窗、版本维护及生产工作台交互，按 Pack 的 API、JdbcTemplate 数据层、租户/工厂范围和发布规则适配。源医疗空库基线没有整体导入；Pack 通过增量 Liquibase 迁移增加身份管理、主数据和制造关联。源通用表单设计器、DHR 填报引擎和电子签名运行时没有引入。

生产写操作继续使用 `CommandBus` 和 `DomainService`。单件 SN、装配谱系、来源主责、工单冻结依据、原始检测与规则判定、返修复测、唯一产出和质量放行仍由 Pack 内核执行。

## 2. 本轮实际范围

| 模块 | 已实现内容 | 关键代码 |
| --- | --- | --- |
| 系统框架 | 独立页面 URL、模块及功能导航、页签、面包屑、工厂上下文、品牌设置、登录与会话恢复、全局反馈；页面与按钮依据权限显示 | `frontend/src/App.tsx`、`frontend/src/components/shared/AppLayout.tsx`、`frontend/src/platform/WorkspaceContext.tsx`、`frontend/src/utils/menuManagement.ts` |
| 公共管理界面 | 医疗源列表容器、统一弹窗、分组表单、状态、空态与确认交互；业务列表具有查询、详情和维护入口 | `frontend/src/components/ListTableShell.tsx`、`FormDialog.tsx`、`FormDialogSection.tsx`、`FormDialogFieldGrid.tsx`、`StatusBadge.tsx`、`TableStateCell.tsx` |
| 用户与权限 | 用户维护、启停、密码重置、多角色分配、工厂授权；角色及权限关系持久化；行政组织层级与用户所属组织；菜单与系统设置；个人资料和改密；登录日志与操作审计 | `frontend/src/pages/system/SystemPage.tsx`、`frontend/src/pages/account/AccountPage.tsx`；`backend/src/main/java/com/zencas/mes/admin/`、`auth/`、`common/Actor.java` |
| 物料及产品 | 料号、名称、规格、品牌、单位、物料/追溯类型；物料版本、发布冻结；从半成品或产成品物料派生产品；产品簇及成员维护 | `frontend/src/pages/master-data/MasterDataPage.tsx`、`MasterDataForms.tsx`、`masterDataModel.ts`；`backend/src/main/java/com/zencas/mes/masterdata/MasterDataService.java` |
| 工序及路线 | 工序分类、工序、标准工时、执行类型/来源；路线及版本；装配、检测节点顺序和主责维护；发布校验及工序 SOP 版本、页码绑定 | 同上；`MasterDataDefinitions.java` 定义模块字段、必填项和关系 |
| 设备与制造资源 | 设备分类、类型、台账、品牌型号/序列号/采购日期、工位及设备/MES 账户和通道映射；工厂—车间—产线—工位维护；保留原派工和作业关系 | `frontend/src/pages/master-data/ResourceManagementPage.tsx`、`MasterDataForms.tsx`；`MasterDataService.java`；原 `mes_factory/mes_workshop/mes_line/mes_station` 表 |
| 文档、字典、原因 | 文档/SOP 目录、版本、上传/预览/下载、发布冻结；字典与条目；不良/报废原因维护；已引用项目删除保护 | `MasterDataForms.tsx`；`MasterFileService.java`、`MasterDataController.java` |
| 物料导入 | 固定 `.xlsx` 模板、逐行预览、类型及重复料号提示、原始行号、成功/失败结果；已有料号不覆盖 | `frontend/src/pages/master-data/MaterialImportDialog.tsx`、`materialImport.mjs`；使用按需加载的 ExcelJS，明确仅支持 `.xlsx` |
| 制造配置 | 产品、已发布物料/路线版本、每个装配位置的物料、必需检验项目、检测来源和通道；草稿编辑、复制、发布、详情；主数据与 SOP 随制造依据冻结 | `frontend/src/pages/manufacturing/ManufacturingPage.tsx`；`DomainService.java`；`MasterDataService.manufacturingContext/registerManufacturingUsage` |
| 工单与生产对象 | 工单查询、创建、派工、冻结依据详情；对象建档与接收；电芯料号/版本关联、SN 及状态管理 | `frontend/src/pages/production/WorkOrderPage.tsx`、`ObjectManagementPage.tsx` |
| 生产工作台 | 工位与任务上下文、扫码识别 SN、工序导航、装配位置绑定、人工检查与过站、检测状态、SOP/产品信息/过程历史快捷面板 | `frontend/src/pages/production/ProductionExecutionPage.tsx`、`ExecutionOperationDrawer.tsx`、`ExecutionQuickPanel.tsx`、`ExecutionDocumentViewer.tsx`、`ExecutionProductDetails.tsx`、`executionHistory.ts` |
| 质量、追溯、接口诊断 | 质量锁定、选择不良原因并授权返修、执行换芯、复测核对与关闭、质量放行；谱系、历史及冻结交付组成；消息回执和冲突详情、原请求核对 | `frontend/src/pages/quality/QualityPage.tsx`、`trace/TracePage.tsx`、`integration/IntegrationPage.tsx`；`backend/src/main/java/com/zencas/mes/productionui/ProductionUiController.java`、`integration/CommandBus.java` |

主数据对外接口使用 `/api/master/{kind}`，列表响应为 `{items,total,page,size}`；制造资源使用 `/api/master/resources/{factories|workshops|lines|stations}`，响应为数组。系统管理接口使用 `/api/admin`，个人账户使用 `/api/account`。生产写入仍经过 `/api/commands/{action}`，保留请求 ID、结果不确定状态和原载荷重试核对。

## 3. 权限、范围与历史保护

- 菜单、路由和按钮限制之外，后端接口检查具体读写权限。角色权限、用户角色和工厂授权保存在数据库中，不以浏览器本地配置作为授权依据；会话认证重新读取服务器身份与授权。
- 业务主数据同时检查租户和已授权工厂，关联目标也必须属于同一范围。共享存储仅接受各模块明确声明的字段和类型；跨范围引用由服务校验和复合外键共同保护。
- 物料、路线及文档的已发布版本不可修改或删除，后续变更新增版本。制造版保存服务器解析的主数据上下文，发布并冻结；工单继续引用发布依据，已有工单和历史记录不会被目录编辑覆盖。
- 主数据之间、主数据与制造版、设备与工位、文档版本与文件建立真实引用。已有引用的删除会被拒绝；原制造组织与派工、作业记录保持关联。返修原因 ID 与已用原因的删除保护接入 Pack 记录。
- 文档文件位于服务器受控存储，默认目录为启动工作目录下的 `var/controlled-documents`，可通过 `mes.document-storage` 指定持久目录。上传限制为 20 MB；读取 `/api/master/files/{id}?factoryId=...` 必须带有效会话并通过范围及权限检查。生产/追溯读取还检查文件被已发布制造版引用。前端取得鉴权二进制后使用临时对象 URL 预览，不产生公网存储链接。

行政组织与制造资源仍是两个模型。当前用户维护包含所属行政组织及多角色/多工厂授权；本轮没有将医疗源的全部多组织成员交互原样迁入，也没有将行政部门替代车间、产线和工位。

## 4. 数据库升级与事实保留证据

迁移入口为 `backend/src/main/resources/db/changelog/db.changelog-master.yaml`，本轮新增：

| 迁移 | 内容 |
| --- | --- |
| `004-identity.sql` | 用户资料及授权初始化标记、行政组织、角色权限/用户角色关系、菜单、设置、身份管理审计和登录日志 |
| `005-masterdata.sql` | 受字段约束的主数据记录、范围内关系、制造引用、受控文件及文档文件关系、设备工位关系；补原制造资源编码/名称/状态及索引 |
| `006-manufacturing-master-links.sql` | 制造版产品/物料版本/路线版本及冻结上下文、检测通道，装配位置及对象物料关联，返修原因关联 |

已对本机真实 PostgreSQL 原运行库执行 `004–006` 升级。升级前备份为 `/tmp/pack-management-upgrade-20261023/before-management-upgrade.dump`；核对证据为同目录 `before-fact-counts.json` 和 `upgrade-evidence.json`。

下表是升级前后对比快照，不代表之后浏览器业务验收结束时的最新数量：

| 原业务事实表 | 升级前 | 升级后 |
| --- | ---: | ---: |
| `mes_trace_object` | 12 | 12 |
| `mes_work_order` | 3 | 3 |
| `mes_station_visit` | 9 | 9 |
| `mes_assembly_link` | 10 | 10 |
| `mes_test_run` | 5 | 5 |
| `mes_measurement` | 5 | 5 |
| `mes_inventory_transaction` | 19 | 19 |
| `mes_rework_order` | 1 | 1 |
| `mes_release_record` | 1 | 1 |
| `mes_release_member` | 7 | 7 |
| `mes_production_fact` | 4 | 4 |

该证据证明迁移阶段保留上述原事实计数；不将计数相同扩大为所有历史字段均已逐值审计。备份位于本机临时目录，需要长期保留时应另行归档。

## 5. 启动与复验

详细环境、独立数据库及当前本机配置见[本地启动与配置手册](local-startup.md)。该手册中早期“无用户管理界面”“令牌仅在内存”“仅执行三个迁移”等历史描述，已被本轮实现更新；当前行为以本记录及实际代码为准。

当前本机前端为 `http://127.0.0.1:5173`，后端为 `http://127.0.0.1:8080`；运行库沿用 `.env` 指向的本机 PostgreSQL `55432/r1_mes`。从仓库根目录加载实际配置，再在后端终端执行：

```sh
export JAVA_HOME='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
export PATH="$JAVA_HOME/bin:$PATH"
set -a
source .env
set +a
mvn -f backend/pom.xml package
java -jar backend/target/module-pack-mes-0.1.0-SNAPSHOT.jar
```

`mvn package` 包含测试。Liquibase 在目标 MES 专用库自动执行尚未运行的迁移，不手工重新导入基线。沿用已有运行库时保留其 `.env`、账户和密码；不要将默认 `5432` 当作当前 `55432` 原库，也不要为重跑验收清空事实。

系统启动自动建立内置系统管理员 `admin`，初始密码 `admin123`；不依赖演示初始化。默认归属租户 T1，首次范围可通过 `MES_ADMIN_TENANT` / `MES_ADMIN_FACTORY` 指定，已有内置账号的租户及密码不会因重启改变。`MES_ADMIN_USERNAME` / `MES_ADMIN_PASSWORD` 仍可用于额外初始化管理员（至少 12 字符），不能覆盖内置 admin。演示初始化仍由 `MES_DEMO_ENABLED` 与 `MES_DEMO_PASSWORD` 单独控制。

另一个终端进入 `frontend/`：

```sh
npm ci
npm run dev
```

锁文件未变化且依赖已安装时可直接运行开发服务。Vite 的 `/api` 代理指向本机 `8080`，改变后端端口时同步更新 `frontend/vite.config.ts`。前端与后端分别运行，JAR 不包含前端构建产物。

复验命令：

```sh
# backend/
mvn test
# frontend/
npm test
npm run build
```

当前已通过后端 **38 项测试**、前端 **15 项测试**，前端 TypeScript 与 Vite 生产构建通过。后端覆盖领域、HTTP、身份管理、主数据、制造关联和接口诊断；前端覆盖命令核对、生产展示模型与 ExcelJS 物料导入解析。自动化后端测试使用独立 H2 PostgreSQL 模式，真实 PostgreSQL 升级另以上节证据核对。

建议从界面顺序复验：维护物料并发布版本 → 派生产品与产品簇 → 维护工序和 SOP → 创建并发布路线版本 → 配置制造版各装配位置的料号及检验项目 → 发布制造版 → 建工单并派工 → 建档/接收对象 → 扫码装配、检测 → 返修复测或放行 → 查询历史与交付组成。测试无权限身份时同时核对直接 URL 和接口拒绝，不能只观察菜单隐藏。

## 6. 浏览器验收记录

本轮使用独立租户 `UI_ACCEPTANCE_1023`、工厂 `QA-FACTORY-1023` 完成真实浏览器与 PostgreSQL/HTTP 联合验收。人员测试身份显式同时授予工艺、操作和质量三个业务角色；设备报文来自独立 DEVICE 测试账号，载荷均带 `simulation:true`，界面明确显示“联调模拟”。验收数据保留在独立租户中，未写入原生产租户。

- **浏览器实际写入**：新增 `UI-CELL-01` 物料并查看详情；电芯 `UI-CELL-A` 建档和收料；从已发布主数据选择产品、物料及路线/SOP创建 `UI-MFG-01` 制造版，保存草稿并发布；创建 `UI-WO-01` 工单、派工并建档 `UI-MOD-A`。
- **浏览器作业与质量闭环**：模组进站，按 S1/S2 连续扫码装配；第一次成功绑定后焦点回到扫码输入、位置自动切到 S2；人工合格检查、过站并转检测；NG 到达后显示锁定，选择真实原因目录授权换芯，替换为 `UI-CELL-C`，进入当前修订复测，核对完整合格证据并关闭返修，随后冻结放行。
- **独立接口输入**：准备已发布物料/路线/SOP和两台工位、补充电芯；按冻结通道 CH9、工单快照、节点与责任版本上报明确标记的模拟 NG/OK。后端正常收到并持久化；作业、质量及接口消息页面每 5 秒更新事实，跨页面也会重新读取。
- **浏览器查询**：用户列表显示多角色/授权工厂及 HUMAN/DEVICE 来源；角色列表读取持久化权限；追溯显示修订 3 的当前组成、三条装拆历史、旧 NG 已失效、有效合格复测及冻结成员。SOP 已用 PDF.js 本地 worker/canvas 显示实际 PDF 文字，缩放/旋转/适宽可用，避免依赖浏览器原生 PDF 插件。
- **Pack 内核联合验证**：另通过真实 HTTP 从同一主数据建立 `UI-PACK-MFG-01`、`UI-PACK-WO-01` 和 `UI-PACK-A`，完成模组投装、检测与放行。冻结成员为 PACK、模组和 B/C 两个电芯；A 电芯在 PACK 装配前拆出，未进入 PACK 谱系及交付快照。数据库唯一产出为 MODULE=1、PACK=1，旧 NG 记录保留。

验收发现并修复：命令客户端浏览器 fetch 绑定失效、模组工单误传空来源工单、菜单模块选择被重置/标签空白、返修后重新检测入口被历史完成状态遮蔽、扫码焦点恢复过早、外部检测结果未刷新，以及业务物料字段显示 UUID。权限拒绝、旧会话即时撤权、跨范围关联、错误料号及通道、版本冻结、消息幂等/冲突由自动化测试覆盖；不把这些全部宣称为人工浏览器逐项测试。

可复核的去凭据证据见 [management-ui-2026-10-23.json](evidence/management-ui-2026-10-23.json)。验收结束后停用本轮临时人员/设备账号并撤销其会话；原账号和密码未改。

## 7. 当前能力边界

- 当前路线执行为 **装配 → 检测两个节点**，装配由人员执行，检测原始结果来自设备或线体 MES；检验项目使用 **OK/NG 枚举规则**。路线版本编辑与 SOP 绑定已经接通，但尚不代表任意多工序、分支并行或数值公差规则引擎已实现。
- 装配位置按冻结料号核对序列化子件。现有 CELL → MODULE → PACK、换芯、旧结果失效、复测和唯一产出规则继续由 Pack 内核处理；本轮没有将医疗 DHR/批次产出服务替换进来。
- 设备台账和接入账户/通道映射已经维护，**现场设备、线体 MES 和 ERP 尚未完成现场联调**。本机接口/模拟输入不证明设备通信、程序联锁、真实时序、现场吞吐量或 ERP 单据闭环通过。
- 原内核对“模组已装入 PACK 后再发生 NG/换芯”会递归锁定父 PACK，但尚无父 PACK 结构返修、解锁复测生命周期。本轮保留该保护，不擅自取消质量锁；该场景尚不能宣布闭环可用。
- 当前没有完整设备点检、校准和保养业务闭环。文件、数据库与接口消息的联合备份恢复、生产环境部署运维和现场验收仍需另行安排。
- 生产依赖审计目前为 0 个 high/critical、2 个 moderate（React Router 6 已知通告）；未将依赖审计结果扩为上线安全认证。
- 本记录不构成合规认证、验证体系完成或正式上线声明。本轮未提交、推送或发布代码。

## 8. 内置系统管理员补充

新增 `007-builtin-administrator.sql` 为账号记录增加 `builtin_admin` 标记及身份约束。`admin` 为 HUMAN 来源，固定持有 SYSTEM_ADMIN，并兼容现有工艺、操作和质量业务身份；自动管理所属租户全部工厂，跨租户边界继续生效。普通用户管理不可停用或改写其角色/工厂，SYSTEM_ADMIN 角色不可编辑、停用或转授，其他管理员不可重置该账号的密码。本人可在个人设置改资料、改密码；改密仍使用原 12–200 字符规则，并撤销旧会话。初始 admin123 仅用于首次创建，数据库保存 BCrypt 哈希；启动不会重置已修改的密码。

补充验证：后端全量 **43 项测试**通过（新增 5 项内置管理员回归），前端 TypeScript/生产构建通过；真实 PostgreSQL 已执行迁移 007，已用 admin/admin123 通过 HTTP 与浏览器登录，读取用户和主数据成功。升级前备份为 `/tmp/pack-management-upgrade-20261023/before-builtin-administrator.dump`；原租户生产事实计数保持一致。证据见 [builtin-admin-2026-10-23.json](evidence/builtin-admin-2026-10-23.json)。
