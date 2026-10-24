# 模组 / PACK MES

> 当前结构（2026-10-24）：工程与产品规划统一在 `Module-PACK-system` 一个 Git 仓库。原 `gmp-platform` 的代码、文档及本地环境已合入本目录，不再作为并列目录或独立仓库。旧 R1-01 实现曾经删除；本次合入的是基于医疗套件改造的 Pack 工程，旧实现与迁移记录仍保留历史边界。

面向电池模组与 PACK 制造的厂级 MES 产品仓库。单客户私有化部署内，必选支持多租户、多工厂、多车间、多产线；覆盖无产线MES的人工站、半自动线及已有产线MES协同，三种模式可混合。租户不预设等于客户、法人或工厂。前后端分别放在 `frontend/` 和 `backend/`，启动及验证脚本放在 `scripts/`，产品与开发文档统一放在 `docs/`。

## 工程目录

```text
Module-PACK-system/
├── frontend/                     # React / TypeScript / Vite / MUI 前端
│   └── src/                      # 页面、组件与业务代码
├── backend/                      # Java 21 / Spring Boot 后端
│   └── src/
│       ├── main/java/            # 接口、领域服务与权限代码
│       ├── main/resources/
│       │   └── db/changelog/     # PostgreSQL / Liquibase 数据库变更
│       └── test/java/            # 后端测试
├── scripts/                      # Pack 本地启停、参考数据与验证工具
└── docs/
    ├── pack-*.md                 # 当前 Pack 改造、实施、运行与业务讨论
    ├── research/                 # 材料核查与调研
    ├── product/                  # 产品蓝图、功能矩阵、行业设计
    ├── architecture/             # eDHR 复用审查与审查台账
    └── development/              # 开发契约及旧 R1-01 历史资料
```

当前工程沿用医疗套件的应用框架、系统管理与主数据界面，包含 Pack 制造版本、工厂/产线/工位、工单与单件、装配与检验、NG阻断、返修复测、质量放行和双向追溯。已有实施范围、测试与软件流程验收见[首条制造链记录](docs/pack-first-chain-implementation.md)和[管理与作业页面验收记录](docs/pack-ui-business-acceptance-2026-10-24.md)；这些是各实施批次的记录，不代表本次目录合并重新执行了验收，也不代表已接入真实设备或ERP。

入口：[本地运行说明](docs/pack-local-setup.md) · [改造方案](docs/pack-adaptation-proposal-2026-10-23.md) · [首链实施记录](docs/pack-first-chain-implementation.md) · [前端说明](frontend/README.md) · [后端说明](backend/README.md) · [文档索引](docs/README.md)。

## 本地开发与启动

在本仓库根目录使用统一脚本管理 Pack 独立环境；首次安装或构建步骤见[本地运行说明](docs/pack-local-setup.md)。脚本使用本机 Homebrew PostgreSQL 18、Java 21 和 Node 22，依赖路径及环境要求以脚本和运行说明为准。

```sh
python3 scripts/pack-local.py start
python3 scripts/pack-local.py status
python3 scripts/pack-local.py stop
```

默认前端 `http://127.0.0.1:3010`、后端 `http://127.0.0.1:8090`、数据库 `127.0.0.1:55440/pack_edhr_dev`。内置管理员首次密码为 `admin / admin123`，已有账号使用当前密码。脚本使用根目录 `.env.pack.local`、`.pack-postgres/` 和 `.pack-runtime/`，分别保存本地密钥、独立数据库及附件/日志/缓存；这些内容与依赖、构建产物保持 Git 忽略。停止服务保留数据库和附件。

不要直接使用保留的医疗默认配置启动：`docker-compose.yml`、应用及 Vite 默认配置仍含医疗工程端口。Pack 脚本显式设置隔离数据源、3010/8090端口和前端代理；医疗项目与其他项目使用各自环境。

当前标准动作支持装配、数值测量和布尔检验，路线仅支持单一顺序链。真实工艺限值、设备协议、现场节拍和交接仍待对应实施验收；工单、派工和人员执行的后续细则见[业务讨论稿](docs/pack-work-order-dispatch-and-execution-rules-2026-10-24.md)，不能视为已全部实现。医疗专属运行入口已退出，遗留源码、历史迁移及DHR构建依赖的清理边界见首链记录。

旧[启动手册](docs/development/local-startup.md)、[R1-01目标卡](docs/development/r1-01-core-loop.md)、[核心实现契约](docs/development/r1-01-implementation.md)和[管理界面迁移记录](docs/development/management-ui-migration-2026-10-23.md)描述已删除的旧实现，不能用于启动当前工程。整个R1、75项功能或42项AC的完成情况不能据单批软件验收推定。

## 2026-10-23 产品规划基线 v1.0

现有材料已形成可评审的产品规划基线：业务蓝图、75项功能矩阵及R0–R4目标/交付/退出条件。当前基于医疗套件改造的 Pack 工程及首链实施记录已归入本仓库；旧 R1-01 实现记录仅作历史参考。规划基线v1.0不代表软件v1.0或现场工艺冻结。采用工艺驱动的标准功能页面、领域配置和工序内标准动作，不引入通用表单、独立作业模板中心、电子签名及认证。

本版补齐厂级统一制造版本及工单快照、范围权限、三模式混合执行与每工序唯一主责；明确绑定/过站/实际消耗写入方，保留电芯→模组→PACK历史谱系、原始结果/规则判定/复测/最终放行及恢复对账。单客户私有化与多租户多工厂兼容，能力是否支持不再待确认。租户业务映射、隔离技术、跨厂共享、现场接口及离线策略仍需核定；设备动作控制和安全联锁归属不变，不包含APS或无条件离线放行。

既有[本地原型业务核查](docs/research/prototype-business-review.md)的37个业务组及精选业务已纳入规划；原型样例、冲突和未验证交互仍单独记录，不将全部页面转为一期必需范围。真实参数/协议和实施指标按阶段落实，不再阻止整理产品级蓝图与路线。

1. [产品目标与阶段路线 v1.0](docs/product/product-goals-and-roadmap.md)：G01–G08业务结果、R0规划/R1核心/R2试点/R3标准发布/R4增强、依赖与退出条件。
2. [业务蓝图 v1.0](docs/product/blueprint.md)：产品边界、角色、三模式、业务闭环、核心对象及运行规则。
3. [标准化功能矩阵 v1.0](docs/product/function-matrix.md)：75项功能的来源、边界、优先级、逐项交付阶段和验收映射。
4. [模组/PACK行业详细设计 v0.4](docs/product/pack-domain-design.md)：18组行业能力、标准动作、配置、规则及页面展开。
5. [开发对象、接口与验收契约 v0.4](docs/development/contracts-and-acceptance.md)：范围与主责、建议数据/接口、异常恢复和AC01–42拟定验收。
6. [材料核查与 eDHR 复用评估](docs/research/materials-and-reuse-assessment.md)：来源读取边界、冲突、复用候选和风险。
7. [eDHR逐项复用审查](docs/architecture/edhr-reuse-audit.md)：原静态审查及移植依赖；[286项台账](docs/architecture/audit/edhr-reuse-inventory.csv)保留47页面、53控制器、74服务/引擎/基础配置、97表和15组横向资产的核查口径。

阶段顺序：R0形成可评审规划 → R1以人工完整链路和三模式模拟验证核心 → R2验证试点适用工艺、真实接口及投产恢复 → R3完成第二型号/路线、多线多厂和标准发布 → R4按数据与业务需要增强。多组织与三模式从R1建立，试点必需工艺及备份恢复不得延后到增强阶段；不虚构固定工期、性能或收益数字。

证据基线：保留v0.2对两份材料及eDHR `edhr-dev` 提交 `96ea56338ef1438938a546382368eb1d7d400938` 的静态审查记录，以及v0.3的U1、8份资料清单和已提供复核摘要；v0.4新增S7本地原型的直接静态读取。S1–S6原件、来源代码及外部网页本轮未重读，飞书正文未纳入；读取范围与图片定位缺口详见调研报告。浏览器file协议访问被拒，原型脚本/交互未执行或验证。文档核查不等于逐行代码审计或运行验收，工艺限值、接口及复测规则待核定；不能据此宣布现场工艺冻结或功能已实现。
