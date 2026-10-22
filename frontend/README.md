# 前端工程

本目录用于模组 / PACK MES 前端。当前只有目录骨架，尚未添加 `package.json`、应用入口及构建配置，暂不支持安装依赖或启动服务。

计划沿用 eDHR 的 React、TypeScript、Vite、MUI 技术路线。可复用组件与业务页面的处理以[逐项复用审查](../docs/architecture/edhr-reuse-audit.md)为准。

| 目录 | 用途 |
| --- | --- |
| `src/` | 应用入口、路由、页面、公共组件与业务接口调用 |
| `public/` | 无需打包处理的公共静态资源 |

生产执行采用标准功能页面与业务配置。普通页面录入组件可以复用；不引入通用表单设计器、DHR 填报引擎或电子签名认证流程。

开发依据：[产品蓝图](../docs/product/blueprint.md)、[行业详细设计](../docs/product/pack-domain-design.md)、[开发与验收契约](../docs/development/contracts-and-acceptance.md)。
