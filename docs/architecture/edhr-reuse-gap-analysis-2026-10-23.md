# 医疗套件代码复用与 Pack 界面差距分析

日期：2026-10-23。范围：应用框架、权限与系统管理、主数据、生产作业，以及它们在当前 Pack 系统中的落地差距。

## 1. 结论

当前 Pack 的界面更接近核心流程验证台，尚未形成完整 MES 的管理和作业界面。问题涉及模块、导航、列表维护、详情、配置和连续作业上下文，不能靠调整配色和卡片样式解决。

医疗套件已有大量值得直接采用的页面与通用模块。建议以其应用框架和通用管理界面为基础，接入 Pack 的制造与执行内核：

- **权限与系统管理**：复用用户、角色、组织、菜单、个人设置、日志和权限配置界面；补齐服务器鉴权、范围隔离与权限变更生效机制。
- **主数据**：复用物料、工序、路线、产品、设备台账、车间、文档、字典及不良/报废原因的页面与适用 CRUD；适配 Pack 的组织范围、制造发布和引用关系。
- **生产作业**：大面积复用扫码工作台、工序导航、SOP 阅读、快捷面板、产品详情、历史展示及工单管理交互；执行数据与动作连接 Pack 的单件 SN、工位访问、装配、检测、返修、放行服务。

“需要适配”应落实为明确的接口、字段和规则改动，不能据此放弃已有页面、重新做成一组简化表单。另一方面，已有页面也不等于其中所有权限和业务链路都已完整实现。本报告不提供缺少依据的复用百分比或工期。

## 2. 本次证据基线

| 对象 | 核对基线 | 说明 |
|---|---|---|
| 医疗源仓库 | `IvenYi/edhr-nexus-frontend`，`edhr-dev@96ea56338ef1438938a546382368eb1d7d400938` | 本次通过远端查询和 fetch 确认；提交日期为 2026-10-22 |
| 医疗默认分支 | `main@782b31d2db6d72ba8cf0aff9353bab8a19f02d0b` | 最后提交日期为 2026-07-09，不能把默认分支当作最新开发版 |
| 医疗本地工作树 | `edhr-dev@336466d95c3866581e5d7d641544756ba7807946` | 比远端落后 58 个提交；本次未切换、合并或改动其工作文件，而是读取最新提交的独立源码快照 |
| Pack 现状 | `main@fc2b372246a1bc1737859f5e2fe8ccd4a74bd593` 加当前未提交/未跟踪源码 | 实际前后端代码大量尚未提交；仅阅读 HEAD 会漏掉已经做出的界面和内核 |

证据分类：本次读取的前端路由、组件、API、控制器、服务及 SQL 为 **original-evidence**；既有[复用审查](edhr-reuse-audit.md)和[286 项台账](audit/edhr-reuse-inventory.csv)为 **secondary-reference**；用户本轮明确提出的界面缺失及三个重点模块为 **user-confirmed**；迁移组合、顺序和验收建议为 **inference**。

本次为静态代码分析，未启动两套系统、执行构建、浏览器业务验收、数据库迁移或设备联调。结论是代码资产与差距判断，不是迁移已完成或运行已通过。

## 3. 当前 Pack 界面实际缺在哪里

| 当前源码事实 | 对使用者的影响 | 应采用的现有资产 |
|---|---|---|
| `frontend/src/App.tsx:6–17` 只有总览、制造与工单、工位执行、质量返修、模拟台、谱系履历六个入口 | 用户无法找到系统管理和主数据维护 | 医疗 AppLayout、Router、模块菜单及首页工作台 |
| `App.tsx:77–80、193` 用组件 state 切页，全部身份显示相同六个菜单 | 无独立页面 URL，无法按模块权限组织完整工作空间 | 路由、菜单配置、权限菜单、多页签、面包屑 |
| `App.tsx:176–179` 以固定角色判断工程/操作/质量按钮 | 不能通过页面配置多角色、页面权限、动作权限及数据范围 | 用户/角色/权限关系和权限配置页面 |
| `App.tsx:225–229` 把制造版、发布、工单、对象建档放在几个通用表单里 | 缺物料、工序、路线、产品、设备、组织资源、SOP 等基础配置入口 | 医疗主数据页面族及其列表、详情、版本交互 |
| `App.tsx:233–243` 把收料、进站、绑定、人工检查和多张记录表并列展示 | 缺少“当前工单—产品—工位—工序—下一动作”的连续上下文 | 医疗 ProductionExecutionPage 及其子组件 |
| `App.tsx:314` 把放行快照直接作为 JSON 展开 | 用户难以阅读交付组成和证据关联 | 分层详情、证据列表等交互；谱系仍由 Pack 服务提供 |
| `001-foundation.sql:50–57` 已有审计表，当前没有审计查询管理页 | 业务留痕不能由管理人员方便检索 | 医疗日志列表、筛选和详情展示 |

以上缺口不能解释为“后端没有任何能力”：Pack 已有服务器会话、租户/工厂授权、制造发布、工单快照、工位访问、绑定消耗、检测、返修、放行及命令回执。需要补的是完整管理界面和可操作的配置链，并把已有内核清楚地呈现给用户。

既有 `edhr-reuse-audit.md:81–92` 已提出复用生产工作台组件，但当前 Pack 前端没有采用这些组件。复用评估与实际界面落地之间存在明显缺口。

## 4. 权限、系统管理和应用框架

| 可采用的源代码 | 已有实现 | 迁移处理 |
|---|---|---|
| `components/shared/AppLayout.tsx`、`router/index.tsx`、`App.tsx` | 模块导航、二级菜单、多页签、面包屑、个人菜单、统一主题、会话超时 | 优先移植；改为 Pack 菜单和品牌，并保留当前租户/工厂上下文 |
| `components/ListTableShell.tsx`、`listTableStyles.ts`、`FormDialog*`、`AppDialog`、`StatusBadge`、`TableStateCell`、`SnackbarProvider` | 统一表格、列宽、表单分组、弹窗、状态、加载/空态与反馈 | 作为页面配套复用；仅按所选页面引入实际依赖 |
| `pages/system/UserPage.tsx`、`api/identity.ts`、`identity/controller/UserController.java` | 用户查询、增改、启停、角色分配、多组织、主组织、移出组织、重置密码 | 页面和通用行为复用；接入 Pack 用户/来源身份，补管理接口权限与范围 |
| `pages/system/RolePage.tsx`、`identity/controller/RoleController.java` | 角色 CRUD、权限树、角色权限关系保存及审计 | 复用 RBAC 配置界面和关系设计；替换固定单角色判断，数据范围必须服务器持久化 |
| `pages/system/OrganizationPage.tsx`、`identity/controller/DepartmentController.java` | 层级组织、组织成员和多组织关系 | 复用行政组织能力；工厂、车间、产线、工位仍使用制造组织模型 |
| `pages/system/MenuManagementPage.tsx`、`system/controller/SystemMenuConfigurationController.java` | 菜单配置、排序、图标、保存、审计与保存权限 | 复用维护能力；现为全局单例配置，须按 Pack 的菜单共享/隔离规则适配 |
| `pages/LoginPage.tsx`、`pages/account/PersonalSettingsPage.tsx` | 登录、失败提示、安全策略、首次改密、资料、头像、密码修改 | 复用正常账户交互；移除医疗签名及证件认证相关内容 |
| `pages/system/AuditLogPage.tsx`、`LoginLogPage.tsx` | 日志筛选、详情、操作者、前后值和上下文 | 复用页面；映射 Pack 工厂、来源、请求 ID 和业务回执，不覆盖同名审计表 |
| `pages/dashboard/*` | 待办/已办、快捷入口、初始化和生产使用指南 | 复用结构与交互，数据与入口改成实际可处理的 Pack 任务 |

### 必须补齐的权限边界

1. **菜单过滤已有，但路由与按钮权限未全面覆盖。** `AppLayout.tsx:237–265、380–386` 实际按权限过滤菜单；`router/index.tsx:63–68` 的守卫只检查 token。用户、角色、组织管理页未调用权限检查来控制管理按钮。
2. **部分管理接口只有登录限制。** `SecurityConfig.java:49–55` 全局要求已登录；UserController、RoleController、DepartmentController 等入口未见对应管理权限注解/检查。需要对实际读写接口补权限，不能用隐藏菜单代替后端拒绝。
3. **角色数据范围尚不是服务端隔离。** `RolePage.tsx:628–642` 读写 localStorage；保存时权限 ID 进入 API，数据范围仍在浏览器。多个列表使用 `findAll()`，不能宣称已按租户/工厂隔离。
4. **源租户模型不统一。** 身份域存在 Long 类型及 `1L` 默认值，生产域多处使用字符串 `default`；不能直接覆盖 Pack 的 tenant/factory 授权。
5. **会话和权限撤销要保留 Pack 的保障。** 源 JWT 过滤器从令牌读取权限，退出接口只记录日志；Pack 当前退出会删除服务器会话，每次认证重新读取用户和工厂授权。迁移应在 Pack 会话解析中增加 RBAC，避免改成权限长期残留的旧行为。

可核对的固定提交证据：[应用壳与菜单过滤][shell]、[路由守卫][router]、[角色接口][roles]、[角色本地数据范围][role-scope]、[安全配置][security]。

## 5. 主数据

| 模块 | 医疗已有能力 | 可复用部分 | Pack 需要适配或补齐 |
|---|---|---|---|
| 物料 | 料号、名称、规格、品牌、单位、用途；版本与有效期；Excel 导入、详情审计、列配置、分页筛选 | 列表、维护、版本、导入和适用 CRUD | 建立料号与 CELL/MODULE/PACK 追溯对象的关联；源固定物料类型不是完整自由分类树 |
| 产品/产品簇 | 从半成品、产成品物料派生产品；制程版本配置 | 产品列表、版本编辑、工作空间组织方式 | 对接真实产品、BOM、装配位置和制造版；解除强制 DHR 模板依赖，工序文档与标准动作改接 Pack 模型 |
| 工序/工序分类 | 工序、分类排序、默认类型、标准工时、导入 | 页面和通用主数据服务 | 关联 Pack 标准动作、角色、证据和工位规则 |
| 路线及版本 | 路线列表、版本、ReactFlow 节点连线画布、图保存 | 编辑界面与图展示 | 适配工序唯一身份、运行来源、主责、写入责任及过站条件；图保存不等于执行语义兼容 |
| 设备分类/类型/台账 | 编码、品牌、型号、序号、采购日、状态、CRUD 和筛选 | 页面与设备目录 | 工厂/产线/工位、设备账户、通道、程序和接入来源映射 |
| 车间 | 独立 CRUD、启停、编码唯一、已引用保护、详情审计 | 当前有效 WorkshopManagementPage | 接入 Pack 的 tenant/factory/workshop；源 workshop 没有完整工厂归属 |
| 文档/SOP | 分类、文档及版本、版本编码、有效期、上传/替换/预览、工序绑定页码 | 页面、文档版本和文件服务 | 文件授权、存储、Pack 工序绑定和工单快照引用 |
| 业务字典 | 字典及条目、启停、排序、内置项保护、审计 | 通用选项管理 | 使用 Pack 权限与范围；生产状态和判定规则仍由业务逻辑负责 |
| 不良/报废原因 | 最新版真实维护页、编码名称、排序、启停、分页、审计、已用保护 | QualityReasonPage 和目录 CRUD | 使用检查改查 Pack 质量、返修、报废记录；源检查依赖医疗表单表 |

不能算作“已经拿来就有”的内容：

- **完整工厂—车间—产线—工位维护**：源当前有效路由仅提供车间管理。历史 SiteWorkshopPage 未挂载，且其部门 API 调用与当前接口不匹配。应采用 Pack 已有层级模型补管理页。
- **设备点检、校准、保养**：本次未找到完整计划、记录、有效期和生产阻断链路。设备台账不能替代这些业务。
- **Pack 制造 BOM、具体工艺参数、装配映射及发布冻结**：这些不是源物料/路线页面自动附带的能力，仍须连接和扩展 Pack 内核。

源版本状态主要依据生效/失效时间窗。Pack 已有 DRAFT→PUBLISHED、发布哈希和工单快照；采用版本交互时必须保留后者，不能让新版本改写在制或历史依据。

固定提交证据：[当前有效路由][master-routes]、[物料及产品派生接口][materials]、[产品制程绑定][product-process]、[设备台账][equipment]、[文档版本][documents]、[原因目录引用检查][reason-usage]。

## 6. 生产作业

| 源资产 | 复用判断 | Pack 中的具体用途 |
|---|---|---|
| `production/WorkOrderPage.tsx` | 大部分列表、筛选、创建/编辑/导入和详情交互可复用 | 工单管理；加入制造版、派工范围、合法投料来源和冻结信息 |
| `production/BatchManagementPage.tsx` | 复用列表/详情和生命周期交互，调整数据对象 | 建立单件 SN/在制对象管理；源 BATCH/SN 与 Pack CELL/MODULE/PACK 是不同维度，不能直接替换枚举；供应商批次作为来源维度 |
| `production/ProductionExecutionPage.tsx` 及 CSS | 作为生产工作台的页面基础，改造数据与中心作业区 | 以当前工单、SN、工位、工序组织扫码、操作、结果与下一动作 |
| `ExecutionOperationDrawer.tsx` | 复用工序导航和切换展示 | 展示路线和当前工序；实际开工资格由服务器确认 |
| `ExecutionQuickPanel.tsx` | 复用快捷面板、打开/收起、焦点恢复和查看位置保留 | SOP、过程记录、产品详情、异常及历史辅助区 |
| `ExecutionDocumentViewer.tsx` | 高复用，接文件权限和版本 | 图片/PDF 预览、缩放、旋转、页码及适合宽度 |
| `ExecutionProductDetails.tsx` | 复用展示与弹层，替换字段 | 制造版、料号、工单、SN、装配修订及工位 |
| `executionRouteLinks.ts`、`executionHistory.ts` | 复用展示工具和历史分组方式 | 数据换为访问、标准动作、原始检测、返修与放行事件 |
| `dashboard/DashboardTaskList.tsx` 等 | 待办/已办列表可复用 | 连接 Pack 的真实待处置/待返修/待放行对象及处理入口 |
| `reports/TraceQueryPanel.tsx`、`DhrTraceReportPage.tsx` | 借用筛选、分页、结果和证据打开交互 | 查询对象改为 Pack SN、当前/历史装配关系及冻结交付组成，不采用医疗表单反查模型替代谱系 |

应形成的连续作业体验：选定工位和任务 → 扫码识别产品 → 显示工序/SOP/需要完成的动作 → 执行绑定、检查或关联检测结果 → 清楚展示阻断原因与下一步 → 查看历史。其界面骨架已有代码可采用。

### 不能直接替换的生产内核

- **表单与 DHR 依赖**：`ExecutionSnapshotBuilder.java:41–47` 对 DHR 模板使用内连接，并固定 `default` 租户；ProductionExecutionEngine 围绕表单、作业和审批推进。不能直接接管 Pack 制造快照与标准动作。
- **产出统计不兼容**：`ProductionOutputService.java:56–80` 从表单投影读取批次数量，并对 SN 返回 `UNSUPPORTED`。Pack 已按唯一产品事实计产，复测不能增加产量，不能用源服务覆盖。
- **生产完成与质量放行不同**：继续保留 Pack 的原始结果/规则结果、NG 锁定、授权换芯、旧测试失效、复测及交付快照。
- **三类执行来源与幂等不可丢失**：人员、设备、线体 MES 的身份与主责继续由 Pack 判定；保留 requestId、业务回执、重复消息和结果待确认处理。
- **局部占位仍存在**：最新 TaskDetail 已有转办候选与原因提交，但 `TaskDetail.tsx:110–116` 的详情仍是占位文案；`api/workflow-tasks.ts` 仍有同一 GET 占位封装。应复用已实现部分，补实际任务详情和处理契约。

通用表单设计器、选表单/份数、独立作业模板中心、电子签名和认证不属于当前 Pack 既有规划。它们与“生产作业工作台可复用”是两个不同判断；去掉医疗记录运行时不应连带丢掉工作台体验。

固定提交证据：[生产工作台][execution]、[快捷面板][quick-panel]、[SOP 阅读器][sop-viewer]、[快照 DHR 耦合][snapshot]、[SN 产出缺口][output]、[任务详情占位][task-detail]。

## 7. 应如何落地复用

建议采用三个可核对的导入批次；这是后续开发建议，本次未实施：

| 批次 | 实际导入内容 | 完成判断 |
|---|---|---|
| 1. 系统框架与管理 | 公共 UI、路由、导航、首页；组织、用户、角色、菜单、个人设置、登录/审计日志 | 页面均有真实接口；角色配置持久化；无权限用户不能经 URL 或 API 绕过；租户/工厂切换不串数据 |
| 2. 主数据与制造配置 | 物料、产品、工序、路线、设备、车间、文档、字典、原因目录；补工厂/产线/工位及 Pack 特有配置 | 用户可从界面准备真实制造配置、发布制造版并建工单；新版本不覆盖已有工单及历史快照 |
| 3. 生产工作台 | 工单与 SN 管理、扫码执行、工序/SOP、快捷信息、结果/异常/历史 | 通过界面完成已有模组→PACK 链路；换芯及复测历史保留，唯一产出正确，三来源和范围拒绝仍有效 |

迁移单元应是“页面与公共组件 + API + 对应后端能力 + 表/索引/权限种子 + 相关回归”，而不是只复制几个 TSX。源前端与 Pack 都使用 React 18/MUI 5，技术栈可衔接；但仍有以下具体改动：

1. 源页面依赖 Router、React Query、Axios、Zustand、公共组件和审计/文件/删除保护等服务；按所选页面补齐依赖，避免把整套表单运行时带入。
2. 源 API 使用 `/api/v1` 和 `{code,data}`，Pack 使用 `/api`、直接数据和命令回执。读取接口逐页映射，生产写操作继续走 Pack CommandClient/CommandBus，保留原请求重试语义。
3. 源后端采用 JPA/Repository，Pack 目前用 JdbcTemplate。通用模块可借用模型和职责，但不能假定现有控制器无需依赖改动便能接入；不为复制代码而整体更换 Pack 数据层。
4. 源最新 Liquibase 是 **97 表的空库基线**，`0001-current-schema.sql:3–6` 明确要求空库。应形成 Pack 的增量迁移，不能把整份基线加入已有库；尤其两边 `audit_event` 同名不同结构，须显式映射。
5. 路线、产品、文档、原因目录的引用保护要改查 Pack 的真实引用。界面保存成功、删除保护和历史读取应同时验收。

既有复用台账可继续作为目录索引，但后续应按实际导入模块提供代码、接口和验收证据。文档中列为“保留/改造”不代表 Pack 已经拥有该功能。

## 8. 本次交付边界

本次新增此分析文档，未修改业务代码、数据库、原复用台账或既有未提交工作；未提交、推送、发布。医疗工作树没有被升级，远端引用已更新，分析使用固定提交快照。

权限覆盖、数据范围、生产统计与 DHR 耦合均已回到原始源码核对；设备维护及层级组织的缺口按已读实现范围说明。没有把静态分析写成浏览器、运行接口、迁移或现场验证通过。

[shell]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/frontend/src/components/shared/AppLayout.tsx#L237
[router]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/frontend/src/router/index.tsx#L63
[roles]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/identity/controller/RoleController.java#L149
[role-scope]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/frontend/src/pages/system/RolePage.tsx#L628
[security]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/common/config/SecurityConfig.java#L49
[master-routes]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/frontend/src/router/index.tsx#L126
[materials]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/masterdata/controller/ProcessModelingController.java#L293
[product-process]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/masterdata/controller/ProductProcessController.java#L375
[equipment]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/masterdata/controller/EquipmentController.java#L40
[documents]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/masterdata/controller/DocumentManagementController.java#L186
[reason-usage]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/masterdata/service/QualityReasonUsageService.java#L17
[execution]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/frontend/src/pages/production/ProductionExecutionPage.tsx
[quick-panel]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/frontend/src/pages/production/ExecutionQuickPanel.tsx#L8
[sop-viewer]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/frontend/src/pages/production/ExecutionDocumentViewer.tsx#L45
[snapshot]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/production/service/ExecutionSnapshotBuilder.java#L41
[output]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/production/service/ProductionOutputService.java#L79
[task-detail]: https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/frontend/src/pages/workflow-center/TaskDetail.tsx#L110
