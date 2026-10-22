# eDHR 逐项复用审查与移植决策 v0.2

日期：2026-10-22。基线：本地eDHR仓库，分支 `edhr-dev`，提交 `96ea56338ef1438938a546382368eb1d7d400938`；本轮核对时已跟踪文件无修改。本报告仅修改独立MES项目中的设计文档，不修改来源仓库。

## 1. 已确认的产品决定与审查口径

- **用户已确认**：采用工艺驱动的标准功能工作台，页面内功能配置化；MES不引入通用表单设计器、表单填报流程、电子签名或签名认证。
- **设计建议**：不移植独立“作业模板→作业流程→表单流程”体系；保留工序内操作步骤、人员确认、SOP和执行证据，统一为标准动作配置。业务审批保留，采用当前登录人、动作权限、意见、时间和审计记录，不要求签名密码、手写签名或身份证认证。
- **原始证据**：以当前路由、API封装、控制器、核心服务、数据库基线和构建文件为依据。旧设计文档及类名只作定位线索。
- **核查范围**：逐项覆盖47个当前路由页面组件、全部53个控制器、74个服务/引擎/基础配置文件、97张当前Liquibase基线表；另有15组公共组件、初始化、依赖与部署资产，共286项。逐项结论见[审查台账](audit/edhr-reuse-inventory.csv)，统计口径见[台账说明](audit/README.md)。
- **核查深度分开记录**：关键链路逐段核查；其它入口/接口职责与依赖核查；数据表按定义和引用检查。台账覆盖不等于每个函数完成正确性审计；本轮没有启动应用、执行业务回归、压测或设备联调。

处置定义：**保留**=代码资产适合作为移植起点，仍需MES权限/配置验收；**改造**=业务存在但必须调整模型或依赖；**替换**=可借鉴交互/算法，原业务实现不导入；**不引入**=不属于本产品范围；**按需**=没有确定需求前不开发。不是以目录名称判断整包复制。

## 2. 页面逐项决定

路径以 `gmp-platform/frontend/src/pages/` 为根，台账保留准确文件名。一个页面的不同业务模式在下表分别说明。

| 页面/入口 | 处置 | MES中的具体处理 |
|---|---|---|
| LoginPage | 改造 | 保留登录、错误提示和密码修改引导；移除签名认证跳转与会话标志 |
| NotFoundPage | 保留 | 重新核对MES路由后保留未找到页面 |
| dashboard/DashboardPage及待办子组件 | 改造 | 保留工作台布局；替换为待检、待处置、待返修和接口异常；去掉表单/DHR快捷入口 |
| account/PersonalSettingsPage | 改造 | 保留基本资料、头像、登录密码、个人操作/登录记录；删除签名板、签名密码、身份证、声明和认证文件；第三方账号绑定按实际连接能力决定 |
| production/WorkOrderPage | 改造 | 保留列表、创建/导入与数量展示；增加产品制造版本、派线、班次、ERP来源、换单条件及SN口径 |
| production/BatchManagementPage | 替换 | 改为在制品/SN管理；供应商批次作为来源维度，不能沿用批次完工代表所有序列化件完工 |
| production/ProductionExecutionPage | 改造 | 复用壳与部分交互；中心区域、数据契约、按钮和完成条件使用标准动作；下节逐组件说明 |
| workflow-center/WorkTemplateList | 不引入 | 取消独立作业模板菜单；工序配置中管理标准动作顺序 |
| workflow-center/WorkTemplateEditor | 不引入 | 不复制其FORM/CONFIRMATION/CONDITION流程设计器；通用绘图控件按需抽取 |
| workflow-center/FormProcessList | 不引入 | 无表单流程目录 |
| workflow-center/FormProcessEditor | 不引入 | 无字段权限、表单节点和签名按钮配置 |
| workflow-center/BindingRuleList | 不引入 | 工序动作显式绑定到制造版本，避免额外的全局作业注入规则 |
| workflow-center/ReviewTemplateList | 替换 | 首版用明确的质量处置/偏差/版本发布审批规则；不默认搬入记录更正/作废专用模板体系 |
| workflow-center/ReviewTemplateEditor | 按需 | 简单角色审批足够时不建通用流程设计器；确有多级审批需求才抽取绘图/版本机制 |
| workflow-center/InstanceList | 改造 | 如采用统一审批任务，按MES业务类型筛选；禁止外部任意创建、改写生产运行实例 |
| workflow-center/InstanceDetail | 改造 | 展示业务对象、申请、决策及状态；删除表单/DHR/签名依赖 |
| workflow-center/InstanceLogs | 改造 | 业务审批动作记录，不开放历史操作日志的任意编辑删除 |
| workflow-center/TaskDetail | 替换 | 业务详情+批准/退回/转办；以登录身份授权，不传signatureId；不得直接引用旧任务API别名 |
| form-management/FormInstanceListPage | 不引入 | 数据从MES业务记录查询，不设表单实例管理 |
| form-management/FormFillingPage | 不引入 | 人工输入由对应功能页面承载 |
| form-management/FormReviewPage | 不引入 | 审批关联质量/偏差业务对象 |
| dhr-management/DhrManagementPage | 替换 | 建立单件履历列表，主键为追溯对象，不强制创建DHR实例 |
| dhr-management/DhrSummaryPage | 替换 | 生产/交付快照和报告，不提供批记录目录重组与表单归档操作 |
| dhr-management/DhrFillingPage | 不引入 | 无DHR补填工作台；更正入口属于原业务记录 |
| dhr-management/DhrReviewPage | 替换 | 成品质量放行页面，审核实际证据与未闭环异常 |
| reports/FormProjectionReportPage：表单追溯 | 不引入 | 不引入表单字段映射/投影模型 |
| 同页：报工、不良、报废、消耗四种报表 | 替换 | 可借鉴列表与筛选；数据分别来自过站、缺陷、处置和库存事务 |
| reports/DhrTraceReportPage | 替换 | 父子装配树、时点关系、受影响成品、工序与原始证据；不用DHR字段索引充当装配关系 |
| master-data/ProcessModelingPage：物料 | 改造 | 保留物料类型、编码、单位、导入；补SN/批次管理方式、效期策略和供应商码映射 |
| 同页：工序 | 改造 | 保留分类与基础数据；补标准动作、执行对象、资源能力和完成条件 |
| 同页：路线 | 改造 | 复用节点连线、版本和展示；只开放有后端执行语义的节点/关系；返修路径单独验证 |
| master-data/ProductModelingPage | 改造 | 产品与制造版本列表；增加模块/PACK类型及适用型号 |
| master-data/ProductModelingWorkspacePage | 改造 | 改为BOM、装配、电气拓扑、路线、检测、工位动作、SOP配置；移除DHR模板/表单绑定 |
| master-data/ProductFamilyModelingPage | 按需 | 可复用产品分组；首版生产引用显式制造版本，避免未经验证的隐式继承/覆盖规则 |
| master-data/DocumentManagementPage | 保留/扩展 | 保留文件类别与版本；供SOP、设备协议、图纸使用，扩展业务访问权限 |
| master-data/TemplateModelingPage：表单模板 | 不引入 | 包含Word表单导入、字段/画布设计、投影与字段签名，均不属于MES首版 |
| 同页：批记录模板 | 不引入 | 不建立DHR目录与表单组合模板 |
| master-data/WorkshopManagementPage | 改造 | 保留车间/产线；补工位、设备能力组、班次和工作会话 |
| master-data/EquipmentPage：类型与设备 | 改造 | 保留档案；补设备身份、工位关系、协议、配方确认、采集状态与有效资格 |
| master-data/QualityReasonPage：不良/报废原因 | 改造 | 保留目录交互；引用检查由表单JSON改为缺陷、处置及库存记录 |
| system/OrganizationPage | 保留/适配 | 保留部门树和人员归属；不把组织部门自动等同于生产工厂/产线 |
| system/UserPage | 改造 | 保留账户启停、角色、部门、密码重置；去掉签名认证展示及SignatureRepository依赖 |
| system/RolePage | 改造 | 保留角色配置；重建MES动作权限与产线范围，区分人和设备账号 |
| system/MenuManagementPage | 改造 | 保留菜单编辑能力；重建允许路由目录与默认菜单，不恢复强制表单/DHR入口 |
| system/BusinessDictionaryPage | 保留/适配 | 保留普通业务枚举；阈值、装配位置和判定规则进入专用版本模型，不塞字典 |
| system/FormLookupItemsPage | 不引入 | 现有追溯项绑定表单字段；MES通过固定业务字段和测量项查询 |
| system/IconManagementPage | 按需 | 复用已有图标展示；自定义图标上传/管理非首条线必需 |
| system/SystemSettingsPage | 改造 | 保留品牌、语言/会话及登录密码策略；删除签名认证周期、签名首次强制等策略 |
| system/AuditLogPage | 改造 | 保留查询/详情；重建MES业务动作、对象位置和前后差异展示 |
| system/SignatureLogPage | 不引入 | 删除MES路由、API、菜单、权限及数据种子中的签名日志 |
| system/LoginLogPage | 保留/适配 | 保留登录记录；设备连接事件另建，不伪装成人员登录 |

仓库中未被当前路由加载的历史独立页面，如RoutePage、OperationPage、SopDocumentPage、SiteWorkshopPage，不因文件存在就同时移植。优先迁移当前有效入口；兼容API是否有调用方由台账及导入时依赖检查决定。

## 3. 执行工作台逐组件处理

| 代码/状态 | 结论 | 开发改动 |
|---|---|---|
| ProductionExecutionPage的扫码、全屏、自适应、焦点处理 | 抽取复用 | 扫描上下文增加固定工位/设备/工单；不同标准动作解析不同条码类型 |
| ExecutionOperationDrawer | 改造复用 | 保留工序导航；现场工位不能任意切到无权限工序并直接开工 |
| ExecutionQuickPanel | 改造复用 | 保留辅助面板/焦点恢复；“填报/作业”改为“执行/SOP/过程记录” |
| ExecutionDocumentViewer | 保留/适配 | 图片/PDF阅读、旋转/缩放/页码可复用；文件访问按业务授权 |
| ExecutionProductDetails | 改造 | 展示制造版本、BOM、工单、对象、工位；移除DHR模板信息 |
| executionRouteLinks | 抽取复用 | 作为路线展示工具；路线可达性最终由服务器判定 |
| executionHistory | 替换数据映射 | 保留时间线思路；来源改为访问/标准动作/设备测试/处置事件 |
| ExecutionFormSelector、ExecutionCopyDrawer | 不引入 | 不存在选表单、表单份数、结束表单等操作 |
| executionCustomForms、executionFormValues、useExecutionPresence | 不引入原实现 | 当前逻辑围绕表单实例/字段；工位占用和并发扫码另设计，不能拿“谁正在填表”当资源锁 |
| FormCanvasPreview、FormDocumentPreview、FormRuntimeField | 不引入 | 由装配、检测、锁附、检验、返修等标准页面替换 |
| WorkflowActionButtons、ButtonSignatureCredentials | 不引入原实现 | 标准业务按钮由后端可执行动作返回；删除签名弹窗与signatureTarget |
| api/production-execution.ts | 替换契约 | 移除formId/copyId/fields/canvas；新增visitId/actionId/specVersion、结构化业务请求及可执行动作 |

## 4. “作业”能力的最终建议

现有WorkTemplateEditor定义START、END、FORM、NOTIFICATION、CONFIRMATION、CONDITION节点。执行时ExecutionSnapshotBuilder按产品/产品簇/工序适用规则装入works；FORM节点继续装入表单；ProductionExecutionEngine推进作业并将其纳入完工条件。

源码同时表明：NOTIFICATION节点在开工检查中被阻断；条件事实目录为作业类型、触发类型、来源类型/单号、执行状态，不能据此认定支持扭矩、漏率或单体电压判断。确认节点证明操作员进行了确认，不证明设备真实执行成功。

**建议首版不导入独立作业中心，采用“路线→工序→标准动作”。**

| eDHR作业能力 | MES去向 |
|---|---|
| 作业开始/结束、顺序 | 工序访问内的动作顺序与依赖；以实际动作完成证据判定 |
| 表单节点 | 对应装配/检测/人工检验等标准页面，原FORM节点取消 |
| 人员确认 | `MANUAL_CONFIRM`标准动作，配置说明、角色、必需证据；记录操作者与时间，不电子签名 |
| 条件分支 | 首版采用产品变型适用条件和明确NG处置路径；不开放任意脚本/递归流程 |
| 通知节点 | 业务异常产生待办/通知事件，投递与生产状态分开；如消息确为放行条件，需显式业务规则 |
| 全局作业适用规则 | 制造版本中显式选择动作配置，避免运行中隐式注入新增动作 |
| 作业版本/历史 | 保留版本冻结思想；动作运行绑定本次访问和配置版本 |
| 作业图编辑控件 | 可借鉴通用缩放、节点、版本选择组件；首版动作排序表足够时不建第二套画布 |

例：PACK上盖锁附工序 = 识别PACK → 核对上盖/密封材料 → 选定工具程序并收到确认 → 按螺栓位置收集有效锁附结果 → 人工外观检查 → 出站校验。工序需要这些动作；用户无需另建一套作业模板、表单模板和表单审批流程。操作步骤仍有业务编号、运行状态和证据关联，避免只剩页面按钮。

## 5. 必须解除的源码依赖

以下为本轮逐段核查的关键链，不是仅凭文件名推断。

| 编号 | 证据与当前行为 | MES处理与验收要求 |
|---|---|---|
| C01 | [ProductProcessController:385](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/masterdata/controller/ProductProcessController.java#L385)要求DHR模板版本；ProductProcessVersionEditorDialog同时配置表单/SOP/DHR审核 | 新制造版本无需任何DHR/表单即可创建、发布与开工；业务动作配置有完整性校验 |
| C02 | [ExecutionSnapshotBuilder:24](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/production/service/ExecutionSnapshotBuilder.java#L24)通过INNER JOIN读取DHR模板，装入forms和works | 新快照含BOM、装配、动作、检测规范、路线、SOP；不含必需的DHR/表单引用 |
| C03 | [ProductionExecutionService:159](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/production/service/ProductionExecutionService.java#L159)命令以formId、values、签名为主；首次开工/完工调用DhrInstanceService | 新标准动作服务负责事务；开工/完工不创建DHR；生产终止路径也解除DHR联动 |
| C04 | [ProductionExecutionEngine:84](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/production/service/ProductionExecutionEngine.java#L84)完工检查表单份与作业完成 | 改为必需动作证据、装配齐套、有效检测、质量锁定；不能用空表单绕过旧校验 |
| C05 | [ProductionOutputService:80](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/production/service/ProductionOutputService.java#L80)不支持SN产出 | 从SN首次有效完工与处置事件计算产出，不使用表单汇总数 |
| C06 | [AuthController:178](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/identity/controller/AuthController.java#L178)返回强制签名验证；登录页、AppLayout、sessionPolicy消费该标志 | 删除签名字段/接口/重定向链，保留登录密码策略；全新用户无需认证即可按角色进入MES |
| C07 | AuthController个人签名、UserController签名展示、PersonalSettingsPage签名板、SystemSettings签名周期、compliance/service身份证OCR及部署配置 | 不导入签名表、签名附件目标类型、OCR运行依赖、签名权限种子；旧来源仓库及其证据不删除 |
| C08 | [RecordControlWorkflowService:85](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/workflow/service/RecordControlWorkflowService.java#L85)要求申请签名；契约BusinessType只有CHANGE/OBSOLETE；WorkflowEngine另有DHR汇总专用逻辑 | 首版建立MES业务审批记录和显式状态转换；需要多级任务时抽取路由能力，不能只传null签名假装已解耦 |
| C09 | [api/workflow-tasks.ts](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/frontend/src/api/workflow-tasks.ts)中的approve/reject等旧别名都GET任务列表；后端存在独立POST动作 | 此API文件不能直接复用为可用审批；逐条绑定真实命令并验收，不能以函数名称认定能力完成 |
| C10 | [QualityReasonUsageService:19](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/masterdata/service/QualityReasonUsageService.java#L19)扫描表单模型、实例和执行JSON检查引用 | 改为缺陷/处置等业务引用；删表单后原因管理仍可用 |
| C11 | DeletionProtectionService/DeletionRelations引用大量DHR/表单/历史表；基线product_process_version的dhr_template_version_id非空且有外键 | 保留引用保护原则，重建MES引用目录与外键；不能直接复制整库后仅隐藏菜单 |
| C12 | [AuditAspect:30](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/common/audit/AuditAspect.java#L30)记录方法上下文，异常仅写日志；前后差异需要业务主动写入 | 基础查询与上下文可复用；关键拆换、判定更正、放行的证据与业务事务一致提交，不能仅依赖AOP注解 |
| C13 | [FileController:91](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/compliance/controller/FileController.java#L91)本地文件存储、大小/MIME限制、目标类型，含签名证据特殊保护 | 保留存储/预览工具，增加MES对象关联与授权；曲线/图像大小按设备样本验证；删除签名特殊分支 |
| C14 | [DhrArchiveService:36](https://github.com/IvenYi/edhr-nexus-frontend/blob/96ea56338ef1438938a546382368eb1d7d400938/gmp-platform/backend/src/main/java/com/zencas/edhr/production/service/DhrArchiveService.java#L36)依赖DHR冻结目录、表单文件和DhrPdfRenderer；后者调用dhrPrint.renderForm | 原归档/PDF服务不直接移植；借鉴快照、清单、文件校验思想，建立MES履历报告模板 |
| C15 | FormProjectionService/Worker、FormTraceIndexService、DhrTraceReportService依赖表单记录和字段映射 | 原投影/追溯后台任务不启动；MES从领域记录查询并索引，避免先包装成表单再投影 |
| C16 | ProductionExecutionService按工单/对象加锁，整对象state_json写入；ProductionObjectStatusMachine与批次流程关联 | 复用版本冲突与事务原则；以工位访问、动作运行和测量记录建模，代表性节拍验证后决定锁粒度 |

## 6. 公共能力、数据与工程处理

| 资产 | 处理 |
|---|---|
| React/MUI/React Query/Zustand、Java/Spring/PostgreSQL/Liquibase | 沿用工程与依赖基线；移植时做构建/依赖检查，不借本次评估升级全栈 |
| AppLayout、列表、分页、列宽、弹窗、抽屉、提示、空态 | 选取复用；AppLayout先移除强制签名与eDHR默认菜单。源码实际ListTableShell位于components根目录 |
| FormDialog等普通输入布局、react-hook-form/zod | 名称中有Form不等于通用表单引擎。标准页面需要的输入校验/布局可以保留，不机械删除所有“form”代码 |
| flow-designer/condition-builder | 通用绘图/条件编辑控件按需抽取；字段目录、执行语义、节点类型必须换成MES定义，不能仅复用画布 |
| JWT/密码哈希、会话切换、用户/角色/部门 | 保留基础并去签名；建立MES动作权限与设备凭据。登录认证不随电子签名一起取消 |
| 物料/工序/路线/文件版本/车间/设备 | 保留对应主数据资产；材料导入与单位需要延续；补工位、BOM、装配、设备通信等模型 |
| 状态机工具、SubjectResolver | 可借鉴通用机制；DHR/Form/Release旧状态机不导入；MES状态值与业务守卫重新定义 |
| file_object/audit_event及相关页面 | 基础表可适配；业务实体类型、访问权、必需差异、保留与撤销规则重建 |
| workflow表族 | 不作为首版必需依赖；采用明确业务审批。若以后引入统一流程，先去除签名/DHR耦合并定义业务回调 |
| 现行数据库基线 | 逐表处置见台账；新建MES基线，只保留选定结构与必要种子。来源库、历史数据、附件不搬迁、不删表 |
| 菜单/权限/系统设置种子 | 重建MES目录；检查menuManagement的强制表单/DHR分组、权限映射、路由白名单，防止菜单自动恢复 |
| 构建与部署 | 使用独立端口/库/文件路径/容器卷；剔除身份证OCR、表单投影运行配置和DHR打印专用构建；普通PDF报告按新需求配置 |
| PDFBox/Playwright/Office与Excel依赖 | 按实际调用保留；DHR打印删除不等于所有PDF预览/Excel导入依赖都应删除 |
| 现有测试 | 保留被选中基础能力的相关用例；移除eDHR专属用例在MES CI中的入口；新增MES动作、幂等、并发、装配与复测测试，不宣称原测试覆盖新业务 |
| docs/knowledge、tools/knowledge-model、AGENTS、旧需求与审查产物 | 作来源参考；不直接变成MES业务政策、运行依赖或开发门禁。MES使用自身范围与规则 |
| node_modules、dist、output、截图、临时数据库/上传文件 | 不作为源码移植资产，不复制进新仓库 |

## 7. 开发切片与退出条件

| 切片 | 文件/模型边界 | 必须通过的验证 |
|---|---|---|
| D0 基础工程 | 选定框架、身份、布局、字典、文件、审计；独立初始化 | 空库启动；新用户登录/改密码可用；没有签名认证、OCR、表单/DHR页面或后台依赖 |
| D1 制造配置 | 产品/路线/制造版本；新增BOM/装配/检测/动作配置 | 无DHR/表单模板可发布制造版本；缺规范/动作类型不支持时拒绝发布；历史版本保持原配置 |
| D2 工位执行 | 新执行契约/访问/动作记录；抽取工作台壳 | 固定工位扫码、受控开工、动作顺序、权限、原始设备结果与完工校验贯通 |
| D3 装配与关键工艺 | SN层级/位置、物料事务、锁附/涂胶/焊接/检测适配 | 同件并发绑定唯一、点位不串用、重传不重复、真实耗料一致；按所选首条线启用 |
| D4 异常/返修/放行 | 质量锁定、影响对象、处置、拆换、复测、审批 | 无电子签名也能按角色处置；更正不覆盖原始证据；换件后相关测试待复核 |
| D5 履历与接口 | 正反追溯、出厂快照、报告、ERP/设备/WMS适配 | 当前/历史/出厂关系可区分；报告来源可查；失败/重试/恢复可对账 |

这些是开发分解建议，不表示要先实现全部行业功能才运行首个切片。优先选实际产品和设备样本；新项目未明确的阈值、工具程序、报文字段及安全条件不得由开发者猜测。

## 8. 本轮结论的变化

相对v0.1：通用表单从“复用候选”调整为“不引入”；独立作业中心调整为工序内标准动作；电子签名全链路排除；审批、归档、质量原因、菜单与登录从笼统复用调整为明确拆依赖后复用。PACK新增设计详见[行业功能详细设计](../product/pack-domain-design.md)，开发对象与接口见[开发契约与验收](../development/contracts-and-acceptance.md)。

“可复用”不等于原样复制或已通过运行验收。本轮完成静态范围、依赖和产品设计审查；实际移植后仍须按D0–D5逐切片执行验证。
