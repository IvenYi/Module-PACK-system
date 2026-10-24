# Pack 本地运行（Module-PACK-system）

当前工程、产品规划与启动脚本统一在 `Module-PACK-system` 仓库根目录；原 `gmp-platform` 的代码和本地环境已合入，不再保留并列目录或独立仓库。本文命令均从 `Module-PACK-system` 根目录执行。

工程最初基于医疗套件本地 `edhr-dev` 的 `336466d95c3866581e5d7d641544756ba7807946`，复制时保留原业务源码，随后按已确认方案适配 Pack。当前实施与各批次验收见 [首条制造链实施记录](pack-first-chain-implementation.md)；本文后半部分为改造前医疗基线的历史验证，本次目录合并不表示重新执行。

## 访问与隔离

| 服务 | 本仓库 Pack 环境 | 已有医疗项目 | 已有 J0WMS |
| --- | --- | --- | --- |
| 前端 | http://127.0.0.1:3010 | http://localhost:3000 | http://localhost:3001 |
| 后端 | http://127.0.0.1:8090 | http://localhost:8081 | http://localhost:8082 |
| PostgreSQL | 127.0.0.1:55440 | 5432 | 5433 |

默认管理员为 `admin / admin123`，由原 Liquibase 种子初始化。
数据库为 `pack_edhr_dev`，应用用户 `pack_edhr`，独立集群管理用户 `pack_cluster`。
Pack 三项服务均配置为仅监听 `127.0.0.1`。

- `.pack-postgres/`：独立 PostgreSQL 18 数据目录，不使用已有 5432/5433 集群。
- `.env.pack.local`：本地随机数据库密码和 JWT 密钥，权限 `600`，不进入 Git。
- `.pack-runtime/files/`：实际业务附件存储，显式覆盖 `edhr.file.storage-path`。
- `.pack-runtime/uploads/`：兼容原 `app.file.upload-dir` 配置。
- `.pack-runtime/tmp/`：Java、Vite 临时文件；OCR 模型和缓存也在 `.pack-runtime/` 内。
- Vite 使用 `--strictPort`，`/api` 代理明确指向 `127.0.0.1:8090`。端口被占用时启动失败，不自动换端口或关闭其他项目。
- 启动脚本清除继承的 Spring 配置和 JVM 参数覆盖入口，避免意外覆盖独立数据源。
- 停止脚本只关闭按项目绝对路径校验过的自身进程组及本目录 PostgreSQL 集群。

## 启停

在本仓库根目录执行；本机已有依赖、数据库和构建从原目录一并保留，首次检出或缺少构建时先完成下方安装步骤：

```sh
python3 scripts/pack-local.py start
python3 scripts/pack-local.py status
python3 scripts/pack-local.py stop
```

`start` 可重复执行；`stop` 保留本仓库的独立数据库和附件。服务日志为
`.pack-runtime/frontend.log`、`.pack-runtime/backend.log`、`.pack-runtime/postgres.log`。
这些是本地开发进程，未配置开机启动。

脚本针对本机 Homebrew PostgreSQL 18、Java 21 和 Node 22，路径写在脚本开头。
不要直接使用原 `docker-compose.yml` 或无隔离参数的 `mvn spring-boot:run`；原配置仍为医疗项目的 3000/8081/5432。

## 重新安装或构建

前端先安装，再构建后端；后端 Maven 会调用前端 `build:dhr-print`。

```sh
cd frontend
npm ci --no-audit --no-fund
npm run build
cd ../backend
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home mvn -DskipTests package
cd ..
```

OCR 使用 `backend/.venv-ocr`，Python 3.11.15，按未修改的
`backend/requirements-ocr.txt` 安装。已验证 PaddlePaddle 3.3.1、PaddleOCR 3.4.1，
五个模型保存在 `.pack-runtime/paddlex-cache/official_models/`。
当前 Pack 运行脚本默认停用医疗 OCR，只保留已安装环境和隔离缓存；它不是 Pack 登录和生产的前置。
DHR PDF 运行时使用本机已安装的 Google Chrome，并关闭 Playwright 自动下载浏览器。

## 医疗复制基线验收（改造前，2026-10-23）

- 前端生产构建、后端 JAR 构建成功；新库 144 条 Liquibase change set 全部执行，98 张业务及迁移表。
- 浏览器实际登录；用户列表、角色权限窗口、物料新增保存和刷新后回查通过。
- 管理接口 58 项：登录、匿名 401、受限账号 403、角色/组织/用户/物料增改查删、工厂/设备/菜单/字典/日志列表、文件上传下载 SHA-256 一致。
- 生产与 DHR 55 项：新建产品及工艺模板、工单、批次、扫码开工、表单保存与提交、生产完工、DHR 整理及正式版本回查。
- 正式 DHR 导出返回 ZIP，包含有效的单表 PDF 和完整 DHR PDF；同时包含表单快照和追溯清单。
- OCR 原脚本成功识别普通中英文样例，缓存命中调用约 8.9 秒。该证据只覆盖 OCR 引擎，不代表身份证或签名业务验收。
- 前端现有回归 28 项、后端选定回归 35 项通过。后端 DOC 测试引用医疗父目录文档，已将所需夹具复制到 `.pack-runtime/isolated-tests/`，在隔离工作目录运行，未修改原测试源码。

证据位于 `.pack-runtime/management-verification.json`、`production-verification-*.json`、
`pdf-export-verification.json`、`ocr-validation.json`、前后端构建和回归日志。
该批原使用带 `QA-PACK` 前缀的生产验收数据与界面物料；后续替换及当前样本见 [参考数据整理记录](pack-reference-data.md)，不将历史夹具视为当前常驻样本。
这是医疗基线的代表性功能验收；未对每个历史分支逐项穷尽，未连接现场设备、邮件服务器或真实签名服务。
以上为改造前的历史记录。当前 Pack 专属业务已开始实施，以 [首条制造链记录](pack-first-chain-implementation.md) 为准。
