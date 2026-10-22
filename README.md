# 模组 / PACK MES

面向电池模组与 PACK 制造的 MES 产品仓库。前后端分别放在 `frontend/` 和 `backend/`，产品与开发文档统一放在 `docs/`。

## 工程目录

```text
module-pack/
├── frontend/                     # 前端工程
│   ├── src/                      # 页面、组件与业务代码
│   └── public/                   # 静态资源
├── backend/                      # 后端工程
│   └── src/
│       ├── main/java/            # Java 源码
│       ├── main/resources/
│       │   └── db/changelog/     # 数据库变更
│       └── test/java/            # 后端测试
└── docs/
    ├── research/                 # 材料核查与调研
    ├── product/                  # 产品蓝图、功能矩阵、行业设计
    ├── architecture/             # eDHR 复用审查与审查台账
    └── development/              # 数据、接口与验收契约
```

当前已建立目录骨架，尚未添加应用入口、依赖清单或构建配置，因此还不能启动前后端服务。计划沿用 eDHR 的 React / TypeScript / Vite / MUI 前端和 Java 21 / Spring Boot / PostgreSQL / Liquibase 后端技术路线，按审查结论逐步移植。

入口：[前端说明](frontend/README.md) · [后端说明](backend/README.md) · [文档索引](docs/README.md)。

## 2026-10-22 产品设计 v0.2

当前交付为开发准备设计稿，尚未启动代码移植或MES功能开发。已确认采用工艺驱动的标准功能页面与业务配置，不引入通用表单、电子签名及认证。作业能力建议收敛为工序内标准动作，不引入独立作业模板中心。

1. [材料核查与 eDHR 复用评估](docs/research/materials-and-reuse-assessment.md)：原始材料的适用边界、源码证据、复用选择和风险。
2. [产品蓝图 v0.2](docs/product/blueprint.md)：产品定位、业务闭环、核心对象、关键页面、架构与实施路线。
3. [标准化功能矩阵 v0.2](docs/product/function-matrix.md)：功能、来源、复用方式、优先级和验收场景。
4. [eDHR逐项复用审查](docs/architecture/edhr-reuse-audit.md)：逐页面处理、作业去留、去签名全链、执行依赖与移植顺序；[286项审查台账](docs/architecture/audit/edhr-reuse-inventory.csv)覆盖47个路由页面、53个控制器、74个服务/引擎/基础配置、97张表和15组横向资产。
5. [模组/PACK行业详细设计](docs/product/pack-domain-design.md)：18组行业能力、标准动作目录、配置页签、关键字段、规则、页面与验收。
6. [开发对象、接口与验收契约](docs/development/contracts-and-acceptance.md)：逻辑数据对象、状态、业务接口、设备消息、异常恢复和21项验收场景。

证据基线：两份用户提供的本地文件，以及eDHR `edhr-dev` 提交 `96ea56338ef1438938a546382368eb1d7d400938`。飞书链接访问失败，内容尚未纳入。逐项覆盖是静态职责/依赖审查，不等于全仓每行代码正确性审计或运行验收。产品方向已确认；新项目限值、拓扑、接口样本与复测政策待确认。文档可用于拆分基础工程及模拟闭环开发，不能据此宣布现场工艺已冻结。
