# 文档索引

本目录保存模组/PACK MES的产品规划、业务设计、来源调研和开发契约。建议先读产品目标与阶段路线，再读业务蓝图和功能矩阵；行业设计与接口契约作为展开材料，eDHR移植前另核对原静态审查台账。

| 分类 | 文档 | 内容 |
| --- | --- | --- |
| 调研 `research/` | [材料核查与 eDHR 复用评估](research/materials-and-reuse-assessment.md) | 材料适用边界、源码证据、复用方向及风险 |
| 调研 `research/` | [本地原型业务核查](research/prototype-business-review.md) | S7最终主树目录、页面/批注证据、精选业务采纳、冲突和未验证交互 |
| 产品 `product/` | [产品目标与阶段路线 v1.0](product/product-goals-and-roadmap.md) | G01–G08产品结果、R0–R4阶段、依赖/落实时点、交付及退出条件 |
| 产品 `product/` | [业务蓝图 v1.0](product/blueprint.md) | 私有化内多租户/多级生产范围、角色、三模式、业务闭环、核心对象和规则 |
| 产品 `product/` | [标准化功能矩阵 v1.0](product/function-matrix.md) | 75项功能的来源、边界、优先级、逐项交付阶段及AC01–42验收映射 |
| 产品 `product/` | [模组 / PACK 行业详细设计](product/pack-domain-design.md) | 18 组行业能力、动作、配置、字段、规则与页面 |
| 架构 `architecture/` | [eDHR 逐项复用审查](architecture/edhr-reuse-audit.md) | 页面与后端复用、作业去留、去签名依赖及移植顺序 |
| 架构 `architecture/audit/` | [审查台账](architecture/audit/edhr-reuse-inventory.csv) · [统计口径](architecture/audit/README.md) | 286 项源码与数据对象的处理结论和核查深度 |
| 开发 `development/` | [开发对象、接口与验收契约](development/contracts-and-acceptance.md) | 范围与执行主责、数据对象、接口、消息恢复及多租户/混合模式/行业验收 |

目标/阶段路线、业务蓝图与功能矩阵已收敛为产品规划基线v1.0（2026-10-23），行业设计和开发契约保留v0.4、原型核查保留v0.1，历史来源审查保留原版本。现有材料足以支撑规划；真实工艺、接口、隔离技术/共享/离线等细节按对应阶段核定，不再阻止形成蓝图和路线。

单客户私有化、多租户、多工厂、多车间、多产线和人工/半自动/已有MES混合模式仍为必选，标准功能页面、领域配置及无通用表单/电子签名约束保留。当前仅完成R0文档整理及评审准备，R1–R4均为后续计划；阶段门槛和验收未执行，不等于软件已实现、现场工艺冻结或评审已批准。

参考eDHR源码链接固定到v0.2审查提交；架构审查及CSV保留原核查口径及目标升级说明。S1–S6原附件未复制到仓库，沿用已提供摘要；本轮新增直接静态读取用户指定S7原型，未执行其脚本或通过浏览器交互验证。来源与限制见调研文档，飞书正文仍未取得。
