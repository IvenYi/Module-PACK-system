# 文档索引

本目录保存模组 / PACK MES 的调研、产品设计、复用审查与开发契约。建议先阅读产品蓝图，再按开发任务查阅行业设计、功能矩阵和接口契约；移植 eDHR 代码前核对逐项审查台账。

| 分类 | 文档 | 内容 |
| --- | --- | --- |
| 调研 `research/` | [材料核查与 eDHR 复用评估](research/materials-and-reuse-assessment.md) | 材料适用边界、源码证据、复用方向及风险 |
| 产品 `product/` | [产品蓝图](product/blueprint.md) | 产品定位、业务闭环、核心对象、关键页面与实施路线 |
| 产品 `product/` | [标准化功能矩阵](product/function-matrix.md) | 功能范围、来源、优先级、复用方式及验收场景 |
| 产品 `product/` | [模组 / PACK 行业详细设计](product/pack-domain-design.md) | 18 组行业能力、动作、配置、字段、规则与页面 |
| 架构 `architecture/` | [eDHR 逐项复用审查](architecture/edhr-reuse-audit.md) | 页面与后端复用、作业去留、去签名依赖及移植顺序 |
| 架构 `architecture/audit/` | [审查台账](architecture/audit/edhr-reuse-inventory.csv) · [统计口径](architecture/audit/README.md) | 286 项源码与数据对象的处理结论和核查深度 |
| 开发 `development/` | [开发对象、接口与验收契约](development/contracts-and-acceptance.md) | 数据对象、状态、接口、设备消息、异常恢复与 21 项验收场景 |

当前版本为开发准备设计稿。产品方向已确认，现场工艺参数和接口样本仍需核定；具体状态以各文档的证据说明为准。

参考 eDHR 源码链接固定到审查时的提交，便于复核。用户提供的 Word、PDF 原始材料未复制到仓库；来源与摘要见调研文档。飞书材料尚未取得内容，未作为已核实需求。
