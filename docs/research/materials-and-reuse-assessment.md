# 材料核查与 eDHR 复用评估

日期：2026-10-22｜修订：v0.2｜状态：产品方向已确认，待补飞书资料及新项目工艺边界

本轮已按用户确认取消通用表单、独立表单流程、电子签名及认证；作业建议收敛为工序内标准动作。逐项源码结论以[详细复用审查](../architecture/edhr-reuse-audit.md)及其台账为准，行业功能与开发契约分别见[行业设计](../product/pack-domain-design.md)、[开发契约](../development/contracts-and-acceptance.md)。

## 1. 核心判断

**建议选择性复用 eDHR，并在独立的模组/PACK MES 产品中改造。** 复用收益主要来自前后端工程、组织权限、通用UI、主数据、文档与版本机制。生产执行、业务审批、审计和履历需拆除原业务依赖后重新适配；新增重点是单件工位执行、标准动作、真实装配关系、设备接入和物料事务。通用表单、独立作业模板中心、DHR专属流程和电子签名认证不作为MES运行依赖。

不宜把“有批次/SN 字段、扫码入口、工序流程图”视为“已经支持模组/PACK MES”。源码明确显示 SN 产出汇总尚未配置，现有追溯主要围绕 DHR 与表单字段，尚不能据此认定具有电芯—模组—PACK 的装配履历。

本次是静态源码和材料调研，没有启动 eDHR、运行测试、进行产线联调或压力测试。因此“可复用”表示有真实实现可作为候选，不表示已完成面向 MES 的运行验收，也不提供未经验证的复用百分比或工期节省比例。

## 2. 来源与阅读边界

| 编号 | 来源 | 本次核对内容 | 适用限制 |
|---|---|---|---|
| S1 | 兰钧-模组线MES技术协议0809.docx | 正文文本、表格文本、关键流程图与界面图；重点查看组装绑定、设备/MES双判定、质量修改、EOL参数示意 | 封面为2022年04月，内容为已有MES的增补项目；夹有其它客户、极片和电芯制造内容。界面示例数字不是工艺阈值 |
| S2 | 建湖量产线模组PACK工艺流程图解-20230215.pdf | 11页文本提取；重点视觉核对第3、4、7、8页的工序顺序、装配和线外流程 | 针对E245-60kWh；第8页明确设计未冻结、只作参考。不能代替新项目最终工艺文件 |
| S3 | [用户提供的飞书文档](https://v0i1wejgao0.feishu.cn/docx/L0ludLGWRoqrMuxcim1cUMjAnkg) | 尝试网页读取和浏览器访问 | 网页读取不可用、浏览器访问超时，未取得正文；不能判断是登录、权限还是连接问题。所有结论均不依赖其未读内容 |
| R | [eDHR edhr-dev 固定提交](https://github.com/IvenYi/edhr-nexus-frontend/tree/96ea56338ef1438938a546382368eb1d7d400938) | GitHub分支与本地HEAD核对一致；抽查依赖、路由、控制器、服务、运行引擎、现行数据库结构和测试文件 | 代码存在不等于对应业务已在新产线验证。仓库提交说明中的历史测试数量不作为本次测试结果 |
| W1 | [ISA-95 官方介绍](https://www.isa.org/standards-and-publications/isa-standards/isa-95-standard) | ERP、制造运营与控制系统的职责分层和接口边界 | 只用于划分系统职责；本次没有购买或逐条核对标准全文，不宣称标准符合性 |
| W2 | [camLine 电池制造产品介绍](https://www.elisaindustriq.com/camline/industries/battery-manufacturing) | 厂商把电芯、模组、PACK与物料、工艺、设备、测试历史关联作为追溯能力 | 属于厂商对自身产品的描述，只作方向交叉核对；不引用其效果数字，不代表本产品必须具备其全部能力 |

S1 SHA-256：`adb00a09fc8f40ccfea0e18ca2c55129a4f8686a3c1db0b025eaeee18c202315`。

S2 SHA-256：`f5c3c76634d8ff1ea1540bffd7a65d922d981c447baf813025932c8fcff04b92`。

下文 S1 的 P 编号为 `word/document.xml` 中 `w:body` 下全部 `w:p` 的顺序号（含空段、表格段落），用于定位此次提取；并附原文主题便于在 Word 中搜索。它不是印刷页码。材料中的操作要求均视为历史项目需求证据，没有作为对本次工具操作或代码修改的指令。

## 3. 从材料确认的需求线索

| 证据 | 已看到的内容 | 提炼出的产品能力 |
|---|---|---|
| S1 P0124–P0130 | 已有MES增补模组产线、正反追溯、ERP变更、安灯OA等 | 建立集成边界；本次重点应落在模组/PACK，不能直接继承整份历史合同范围 |
| S1 P0223–P0258 | 工厂/车间/工位/设备、工序路线、参数上下限、产品与BOM版本 | 生产资源、产品制造版本、路线及参数规范 |
| S1 P0288–P0319 | 工单同步、数量与日计划调整；已开工计划不可直接修改 | 工单与派工分层，变更对在制品影响检查 |
| S1 P0324–P0354、P0439–P0441 | 接收、上料、剩余料、退料/清料、换单前处理 | 线边物料及设备/工位生产会话 |
| S1 P0358–P0363 | 前工序有记录、前工序OK、当前工单匹配 | 进站资格判断与可解释的拦截原因 |
| S1 P0365–P0370、P0388、P0543 | 模组编码、定量绑定、电芯重复扫描与工单校验 | 编码规则、序列号管理、装配完整性与唯一性 |
| S1 P0377–P0379 | 返回前工序、拆换异常电芯，CCS更换及耗损 | 返修任务、拆换履历、复测与材料处置 |
| S1 P0391–P0405 | 首检/巡检、不良处置、首件放行、FIFO/效期 | 检验计划、质量锁定、物料可用性判断 |
| S1 P0408–P0413、P0427 | 多种设备通讯、参数/报警、断点续传、故障后补录 | 设备适配、业务事件收件箱、重传去重、受控补录 |
| S1 P0470、P0507等 | 设备与MES双判定；NG也保存过点、下站拦截 | 分开记录设备结果、规则结果、综合结果与过站事实 |
| S1 P0623–P0631 | 两次液冷气密、箱体气密、外观、并行充放电设备 | PACK工序模板、可替代资源组、线外测试衔接 |
| S2 第3–5页 | OCV/IR、清洁/涂胶、堆叠保压、CCS/焊接、静置、绝缘耐压、DCR、称重 | 把工序动作标准化，参数和顺序按产品配置 |
| S2 第6–8页 | BMS等部件、模组入箱、电连接、涂胶、锁附、气密、静动态测试、容量测试、包装入库 | PACK装配位置、关键件关联、质量关口及线内/线外路线 |

## 4. 材料不能直接转成产品规则的地方

1. **范围混杂。** S1 P0266–P0274、P0303–P0306涉及匀浆、涂布、辊压、分切、注液等上游电芯制造流程，并出现“新中”等称谓。标准产品一期建议从合格电芯接收/上线开始；上游电芯MES作为追溯数据来源，具体边界待新项目确认。
2. **两条产线不能拼成一个强制流程。** S1侧缝焊接、顶盖焊接和两次EOL，与S2端板/CCS/汇流排及PACK流程并不完全相同。保留为不同工艺模板，不能假设全部产品依次经过所有步骤。
3. **工艺版本尚未确定。** S2第8页已明确“设计暂未冻结”；涂胶面积、型号、顺序等只能作为该版本示例。配组阈值、工艺限值及复测政策需要工艺/质量负责人给出。
4. **数据修改影响原始判定。** S1 P0475提出修改后最终结果只校验MES结果。若照搬，设备NG可能被覆盖成OK，失去失效调查依据。建议保留原始测量及设备判定，新增更正/复测记录；最终处置独立审批，不能靠编辑数值抹掉原失败。
5. **“一键审厂”不应作为标准功能。** S1 P0432描述审厂模式弱化防错并标记异常。建议提供透明的偏差授权或降级运行：明确范围、有效期、原因、批准人、受影响SN及后续复核，保留实际拦截与处置记录。审查报表应反映真实状态。
6. **消耗时机不一致。** S1 P0334/P0452为第一次过点消耗，P0493/P0522等又写每次过点消耗。重传、返工、真实二次加工如何扣料必须分别定义；通信重试不得重复消耗，返工实际新增耗料应另外记账。
7. **“同工单”不是跨层装配通则。** S1模组内电芯绑定有工单一致约束，但模组工单与PACK工单可以是不同层级工单。建议区分来源工单、目标装配工单和投料分配关系，配置跨批/跨工单使用策略。
8. **接口目录不是可验收协议。** Webservice、Modbus、OPC UA、串口只说明通讯类型；尚缺字段、单位、时间戳、触发条件、ACK、超时、缓存和设备权限规则。
9. **历史IT选型和服务条款不是新产品承诺。** S1同时出现旧操作系统/浏览器要求及不同数据库支持口径。建议沿用现有技术栈并重新确认部署要求；不自动承诺多数据库适配、不停机升级、全部协议以及历史合同中的驻场/响应时限。
10. **示意界面存在未完成定义。** P0514明确“质量数据待确认”，P0607标注缺少参数名称；EOL截图含重复/模糊命名及演示数值。只据此确定“参数规范与测试结果”能力，不直接生成生产阈值。

## 5. eDHR 源码证据与复用判断

以下路径均位于 `gmp-platform/`，以固定提交为准。源码是本次确认依据，README和历史规格只作定位线索。

| 编号 | 实现证据 | 判断与迁移边界 |
|---|---|---|
| R1 | `frontend/package.json`；`backend/pom.xml` | 已含React 18、TypeScript、Vite、MUI、React Query，以及Java 21、Spring Boot 3.3、JPA/JDBC、PostgreSQL、Liquibase。仓库虽名为frontend，实际上已有后端，建议整体继承必要工程能力 |
| R2 | `frontend/src/components/shared/AppLayout.tsx`、`frontend/src/components/ListTableShell.tsx`、`frontend/src/components/listTableStyles.ts`；`frontend/src/router/index.tsx` | 通用列表及导航可复用；AppLayout需去签名强制跳转和eDHR菜单。工位端抽取壳，中心内容改为标准功能页面 |
| R3 | `backend/.../common/config/SecurityConfig.java`；`identity/controller/`；`production/controller/ProductionExecutionController.java:16` | JWT、方法授权及业务权限已有实现。工位/设备服务账号、产线数据范围、操作员资格需要新增核验；有菜单不等于有服务端动作权限 |
| R4 | `backend/.../common/audit/AuditAspect.java`；`compliance/controller/SignatureController.java`；`production/service/DhrArchiveService.java:36` | 电子签名全部排除；审计基础可复用，但AOP不自动保证完整差异及可靠落盘。DHR归档依赖冻结目录/表单打印，原服务不直接复用；只借鉴冻结、清单、校验机制，MES另建履历报告 |
| R5 | `masterdata/controller/ProcessModelingController.java`、`ProductProcessController.java`；`production/service/ExecutionSnapshotBuilder.java:24` | 复用物料/工序/路线/SOP及版本资产；产品配置、执行快照改造为BOM/装配/动作/规范。当前配置要求DHR模板，快照INNER JOIN DHR且装入forms/works；必须解除，不使用空模板绕过 |
| R6 | `production/service/ProductionService.java:62`；现行schema中`production_object` | 已支持BATCH/SN生产对象，SN目标数量约束为1。该身份模型可扩展，但批次与单件的关系、序列化件的装配层级不能只靠object_type表达 |
| R7 | `production/service/ProductionOutputService.java:80` | 非BATCH返回`UNSUPPORTED / SN产出算法尚未配置`。单件良品、NG、报废、返修后合格和首次通过率需明确实现 |
| R8 | `production/service/ProductionExecutionEngine.java:33`；`ProductionExecutionService.java:159` | 可借鉴前置检查、修订校验与事务原则；原完工以表单/作业为核心，执行契约需替换为工位访问/标准动作/设备结果/质量条件，不能只换页面 |
| R9 | `production/service/ProductionExecutionService.java:167`及`:239`；schema中`production_execution` | 当前执行在工单/生产对象上加锁，保存对象级JSON状态，并联动DHR创建/完成。不能直接让所有高频设备数据都写入同一JSON；需要测量/事件独立记录及针对真实节拍的性能验证 |
| R10 | `production/service/DhrTraceReportService.java:25`及`:85`；`FormTraceIndexService.java` | 现有正反查询基于DHR/表单索引；注释明确DHR条件命中不等于同一业务事件/同一行。可复用查询壳和证据展开，装配关系及时态查询要新增专门模型 |
| R11 | `production/service/FormProjectionService.java`；现行schema中`form_projection_record` | MES不引入该表单投影链；消耗、报工、不良、报废由领域事务直接产生，库存不能由报表反推 |
| R12 | 现行schema；主代码针对BOM、装配关系、库存台账、OPC UA/Modbus/MQTT的检索 | 本次未找到这些完整业务子系统；属于新增/外接范围。此结论基于当前仓库范围，不排除用户另有网关或其它服务 |
| R13 | `ProductionExecutionEngine.java:41`、`:46`、`:807`及`:937` | 作业主要推进表单/确认/有限条件，通知尚不可运行；返工不等于已有闭环。首版以工序标准动作取代独立作业中心，质量审批和通知分别处理 |
| R14 | 多处`tenant_id='default'`，如`DhrTraceReportService.java:27` | 不能据此承诺SaaS多租户隔离。首版可按客户独立部署/独立数据库推进；如需要共享数据库多租户，应单独评估改造 |

代码链接示例：[SN产出边界](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/production/service/ProductionOutputService.java#L80)、[执行动作与事务](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/production/service/ProductionExecutionService.java#L159)、[DHR追溯语义](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/production/service/DhrTraceReportService.java#L85)。

已有相关测试文件包括`ProductionExecutionIntegrationTest`、`ProductionOutputPostgresTest`、`ProductionServiceTest`、`DhrTraceReportPostgresTest`等。迁移时应保留并重跑受影响检查，再新增MES场景；本次未执行它们。

## 6. 改造路径比较

| 路径 | 初期收益 | 主要代价 | 建议 |
|---|---|---|---|
| 从零新建 | 领域模型容易保持单纯 | 重做权限、UI、主数据、文档版本与基础工程 | 暂不选；源码已有可继承资产 |
| 直接在eDHR开发分支上增加所有MES逻辑 | 起步较快 | 两种产品的发布、测试、菜单和执行规则互相影响 | 不作为当前首选；除非明确转成同一产品线统一治理 |
| 在独立MES仓库选择性派生固定版本资产 | 基础能力可复用，MES可以独立验收 | 需解除表单/DHR/签名耦合；共享修复要有回合机制 | **当前推荐，按逐项台账导入** |
| 先拆共享平台/微服务再做MES | 长期共享更系统 | 在需求尚未稳定时先承担拆分、接口和发布成本 | 推迟到两种产品确实重复维护相同能力时 |

建议执行方式：记录来源提交和逐项清单；导入选定源码与构建资产，沿用前后端栈；建立MES独立数据库基线、菜单、权限及端口。原有表单/DHR/签名表与初始化数据不作为隐形依赖。基础修复记录对应上游提交，业务特化留在MES。无需一开始逐个重命名`edhr`包名或拆出大量公共库。

正式移植时需要核查源码/依赖的许可证与第三方资产清单，保留适用声明；本次没有进行法律审查。不要复制用户已有数据库、附件、凭据和历史测试输出作为新产品种子数据。

## 7. 可能被低估的成本

- 设备厂家是否提供可联调接口、设备是否能正确执行MES拦截、断网时谁有放行权，往往比页面开发更影响交付。
- OCV/IR等测试数据有单位、测试时间、温度条件和设备校准背景，缺少这些信息时简单比较数值可能产生错误判断。
- 装配唯一性必须覆盖并发扫码、重复报文、替换后历史查询，单个页面校验不能保证生产一致性。
- 旧eDHR对象级JSON、工单锁与自动建DHR机制的吞吐能力尚未证明适合真实产线；先做代表性链路再决定拆分程度。
- 只接测试结果摘要与保存完整曲线/图像，对存储容量、网络、备份和追溯体验的成本不同。
- 多型号、多工厂、不同ERP及设备协议意味着多个配置和适配包；不能把第一客户的硬编码称为标准产品。
- 当前材料缺新项目节拍、并发、数据保留、离线时长和验收口径，尚不足以给出可信固定排期与报价。

## 8. 本次完成与缺口

已形成[产品蓝图](../product/blueprint.md)和[标准化功能矩阵](../product/function-matrix.md)，完成材料—能力—复用边界的首轮对应。

飞书正文、新项目最终工艺、设备点表/接口协议、ERP主数据职责、质量规则和部署规模仍需补充。原项目代码、数据库和远程仓库均未修改。本次产出应作为后续需求评审的起点，而非已冻结PRD或上线验收结论。
