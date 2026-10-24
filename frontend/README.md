# 前端工程

本目录为基于医疗套件改造的 Pack MES 管理与作业前端，使用 React 18、TypeScript、Vite 与 MUI，沿用应用框架、多页签和通用管理交互。前端与 `backend/`、`scripts/` 和 `docs/` 同属 `Module-PACK-system` 一个仓库。

## 安装、运行和检查

完整数据库、构建与启停步骤见[本地运行说明](../docs/pack-local-setup.md)。首次在本目录安装依赖并构建：

```sh
npm ci --no-audit --no-fund
npm run build
```

准备好后端构建后，在仓库根目录统一管理 Pack 服务：

```sh
python3 scripts/pack-local.py start
python3 scripts/pack-local.py status
python3 scripts/pack-local.py stop
```

Pack 页面为 `http://127.0.0.1:3010`，`/api` 代理到 `http://127.0.0.1:8090`。脚本传入前端端口、`--strictPort` 和 `VITE_API_PROXY_TARGET`，端口占用时停止启动。直接执行 `npm run dev` 会使用医疗默认的 3000/8081 配置，不作为 Pack 日常启动方式。不要把密码或令牌放入 `VITE_` 变量。

首次可使用内置管理员 `admin / admin123` 登录，已有账号使用当前密码。浏览器保存令牌与用户显示缓存；权限和工厂范围以服务器校验为准。退出、改密及授权变化的生效规则见[首链实施记录](../docs/pack-first-chain-implementation.md)。

前端构建检查 TypeScript 并生成 `dist/`。Pack 专属回归可在本目录运行：

```sh
node --test src/pages/pack/*.test.mjs
npm run build
```

`package.json` 没有通用 `npm test` 入口；其他管理交互回归及批次验收命令见[页面业务验收记录](../docs/pack-ui-business-acceptance-2026-10-24.md)。这些结果是既有实施记录，本次目录合并不代表已重新执行。依赖、构建产物、生成的配置文件与本地环境由 Git 忽略。

## 当前页面与边界

系统管理和基础主数据沿用原工程；Pack 页面覆盖制造版本、工厂/产线/工位、生产准备、生产工作台、质量返修与放行、谱系追溯和设备消息。工作台使用装配、数值测量和布尔检验等标准动作，区分制造完成与质量放行，保留原始NG、旧件及失效证据。

当前路线仅支持单一顺序链；工单派工、任务切换、系统发号与数量结案的后续细则仍按[业务讨论稿](../docs/pack-work-order-dispatch-and-execution-rules-2026-10-24.md)继续确认实施，不把讨论中的全部控件和流程当成现成页面。断连时不提供离线放行，按钮禁用也不能替代后端授权与业务校验。

医疗表单、DHR、签名入口已退出正式 Pack 菜单与路由；部分历史源码和DHR打印构建仍保留，清理边界见[首链实施记录](../docs/pack-first-chain-implementation.md)。旧[管理界面迁移记录](../docs/development/management-ui-migration-2026-10-23.md)及5173/8080启动资料属于已删除的旧 Pack 实现，不作为当前工程说明。

| 目录 | 用途 |
| --- | --- |
| `src/` | 应用入口、路由、管理及Pack页面、公共组件和接口调用 |
| `scripts/` | 前端定向回归、界面核查及辅助工具 |

开发依据：[改造方案](../docs/pack-adaptation-proposal-2026-10-23.md)、[产品蓝图](../docs/product/blueprint.md)、[行业详细设计](../docs/product/pack-domain-design.md)、[开发与验收契约](../docs/development/contracts-and-acceptance.md)。
