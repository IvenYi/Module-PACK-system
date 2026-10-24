# 文档索引

本目录保存模组/PACK MES的产品规划、业务设计、来源调研和开发契约。建议先读产品目标与阶段路线，再读业务蓝图和功能矩阵；行业设计与接口契约作为展开材料，eDHR移植前另核对原静态审查台账。

## 当前工作入口（2026-10-24）

当前工程、启动脚本与产品规划已合并至 `Module-PACK-system` 一个仓库，不再使用并列的 `gmp-platform` 目录。当前运行方式见[本地启动说明](pack-local-setup.md)，改造范围见[基于现有医疗套件的 Pack 改造方案 v0.1](pack-adaptation-proposal-2026-10-23.md)。

当前合入的是基于医疗套件改造的 Pack 工程，首链及页面业务已有实施记录；本次目录合并不代表重新执行这些验收。原 R1-01 代码曾经删除，以下旧实现、启动和管理界面迁移材料仍为历史记录，不能用其“已实现/已验收”内容推定当前工程能力。产品蓝图、75 项矩阵和 AC01–42 继续作为目标与拟定验收依据。

| 分类 | 文档 | 内容 |
| --- | --- | --- |
| 当前运行 | [Pack 本地运行说明](pack-local-setup.md) | 单仓库启停、3010/8090/55440隔离配置、构建和本地数据边界 |
| 当前改造 | [Pack 改造方案](pack-adaptation-proposal-2026-10-23.md) | 已确认总体方向、制定方案时的差异及分批实施边界 |
| 当前实施 | [首条制造链实施记录](pack-first-chain-implementation.md) | 电芯→模组→PACK、质量返修与追溯的实施及各批次验证记录 |
| 当前参考数据 | [参考数据整理](pack-reference-data.md) | 产品参考资料、内部编号、软件联调参数和历史QA替换边界 |
| 页面业务验收 | [管理与作业页面验收记录](pack-ui-business-acceptance-2026-10-24.md) | 已记录的页面操作、回归及数据库只读核对结果 |
| 待实施业务细化 | [工单、派工与人员执行业务规则](pack-work-order-dispatch-and-execution-rules-2026-10-24.md) | 已确认原则与仍需讨论的派工、换单、SN及数量结案细则 |
| 调研 `research/` | [材料核查与 eDHR 复用评估](research/materials-and-reuse-assessment.md) | 材料适用边界、源码证据、复用方向及风险 |
| 调研 `research/` | [本地原型业务核查](research/prototype-business-review.md) | S7最终主树目录、页面/批注证据、精选业务采纳、冲突和未验证交互 |
| 产品 `product/` | [产品目标与阶段路线 v1.0](product/product-goals-and-roadmap.md) | G01–G08产品结果、R0–R4阶段、依赖/落实时点、交付及退出条件 |
| 产品 `product/` | [业务蓝图 v1.0](product/blueprint.md) | 私有化内多租户/多级生产范围、角色、三模式、业务闭环、核心对象和规则 |
| 产品 `product/` | [标准化功能矩阵 v1.0](product/function-matrix.md) | 75项功能的来源、边界、优先级、逐项交付阶段及AC01–42验收映射 |
| 产品 `product/` | [模组 / PACK 行业详细设计](product/pack-domain-design.md) | 18 组行业能力、动作、配置、字段、规则与页面 |
| 架构 `architecture/` | [eDHR 逐项复用审查](architecture/edhr-reuse-audit.md) | 页面与后端复用、作业去留、去签名依赖及移植顺序 |
| 架构 `architecture/audit/` | [审查台账](architecture/audit/edhr-reuse-inventory.csv) · [统计口径](architecture/audit/README.md) | 286 项源码与数据对象的处理结论和核查深度 |
| 开发 `development/` | [开发对象、接口与验收契约](development/contracts-and-acceptance.md) | 范围与执行主责、数据对象、接口、消息恢复及多租户/混合模式/行业验收 |
| 历史推进目标 `development/` | [R1-01 最小模组→PACK业务闭环](development/r1-01-core-loop.md) | 已删除旧实现的夹具、D01–D09检查、W1–W7任务及历史完成证据 |
| 历史实现契约 `development/` | [R1-01 实现与复现](development/r1-01-implementation.md) | 旧实现的对象、接口、权限、复现与测试记录；不是当前副本能力 |
| 历史本地运行 `development/` | [R1-01 启动与配置手册](development/local-startup.md) | 旧实现的环境和启停记录；当前工程使用 Pack 本地运行说明 |

目标/阶段路线、业务蓝图与功能矩阵已收敛为产品规划基线v1.0（2026-10-23），行业设计和开发契约保留v0.4、原型核查保留v0.1，历史来源审查保留原版本。现有材料足以支撑规划；真实工艺、接口、隔离技术/共享/离线等细节按对应阶段核定，不再阻止形成蓝图和路线。

单客户私有化、多租户、多工厂、多车间、多产线和人工/半自动/已有MES混合模式仍为必选，标准功能页面、领域配置及无通用表单/电子签名约束保留。R1-01旧代码已删除，实现契约仅保留历史范围与证据；当前以医疗套件改造后的 Pack 工程继续开发，已实施范围及后续缺口以首链记录和业务讨论稿为准。整个R1、R2–R4及全部AC不能据历史切片宣布验收通过，现场工艺和接口尚未冻结。

参考eDHR源码链接固定到v0.2审查提交；架构审查及CSV保留原核查口径及目标升级说明。S1–S6原附件未复制到仓库，沿用已提供摘要；本轮新增直接静态读取用户指定S7原型，未执行其脚本或通过浏览器交互验证。来源与限制见调研文档，飞书正文仍未取得。
